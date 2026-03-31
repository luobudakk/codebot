from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

from app.core.config import Settings
from app.core.metrics import RETRIEVAL_ERRORS, RETRIEVAL_LATENCY_SECONDS
from app.ingestion.embeddings import encode_dense
from app.ingestion.qdrant_store import get_client
from app.retrieval.bm25_index import bm25_index
from app.retrieval.neo4j_graph import get_driver, graph_search_chunks
from app.retrieval.reranker import rerank_pairs
from app.retrieval.vector_qdrant import VectorHit, vector_search


def _minmax_norm(values: list[float]) -> list[float]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return [1.0] * len(values)
    return [(v - lo) / (hi - lo) for v in values]


@dataclass
class RetrievalHit:
    chunk_id: str
    text: str
    namespace: str
    source: str
    score: float
    routes: list[str] = field(default_factory=list)

    def model_dict(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "text": self.text,
            "namespace": self.namespace,
            "source": self.source,
            "score": self.score,
            "routes": self.routes,
        }


@dataclass
class RetrievalResult:
    context_available: bool
    agent_notice: str
    hits: list[RetrievalHit]
    branches: dict[str, str]


def _merge_branch(
    store: dict[str, RetrievalHit],
    chunk_id: str,
    text: str,
    namespace: str,
    source: str,
    score: float,
    route: str,
) -> None:
    hit = store.get(chunk_id)
    if hit is None:
        store[chunk_id] = RetrievalHit(
            chunk_id=chunk_id,
            text=text,
            namespace=namespace,
            source=source,
            score=score,
            routes=[route],
        )
        return
    if score > hit.score:
        hit.score = score
        if len(text) > len(hit.text):
            hit.text = text
        if namespace:
            hit.namespace = namespace
        if source:
            hit.source = source
    if route not in hit.routes:
        hit.routes.append(route)


def _run_vector(query: str, namespaces: list[str], top_k: int, settings: Settings) -> list[VectorHit]:
    qv = encode_dense([query])
    if not qv:
        return []
    client = get_client(settings)
    return vector_search(
        client,
        settings,
        qv[0],
        namespaces,
        top_k=top_k,
        score_threshold=None,
    )


def _run_bm25(
    query: str,
    namespaces: list[str],
    top_k: int,
) -> list[tuple[str, str, str, str, float]]:
    raw_rows: list[tuple[str, str, str, str, float]] = []
    for ns in namespaces:
        ranked = bm25_index.search(ns, query, top_k=top_k)
        for cid, text, raw_score in ranked:
            raw_rows.append((cid, text, ns, "", float(raw_score)))
    if not raw_rows:
        return []
    scores = [r[4] for r in raw_rows]
    norms = _minmax_norm(scores)
    return [
        (cid, text, ns, src, float(n))
        for (cid, text, ns, src, _), n in zip(raw_rows, norms, strict=True)
    ]


def _run_graph(
    query: str,
    namespaces: list[str],
    top_k: int,
    settings: Settings,
) -> list[tuple[str, float, str, str, str]]:
    drv = get_driver(settings)
    if drv is None:
        return []
    return graph_search_chunks(drv, namespaces, query, top_k=top_k)


def retrieve_hybrid(
    query: str,
    namespaces: list[str],
    settings: Settings,
    top_k: int | None = None,
    score_threshold: float | None = None,
    use_rerank: bool | None = None,
) -> RetrievalResult:
    top_k = top_k if top_k is not None else settings.retrieval_default_top_k
    score_threshold = (
        score_threshold if score_threshold is not None else settings.retrieval_score_threshold
    )
    use_rerank = use_rerank if use_rerank is not None else settings.retrieval_rerank_enabled

    branches: dict[str, str] = {"vector": "ok", "bm25": "ok", "graph": "ok"}
    vec_hits: list[VectorHit] = []
    bm_rows: list[tuple[str, str, str, str, float]] = []
    gr_rows: list[tuple[str, float, str, str, str]] = []

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=3) as ex:
        f_map = {
            ex.submit(_run_vector, query, namespaces, top_k, settings): "vector",
            ex.submit(_run_bm25, query, namespaces, top_k): "bm25",
            ex.submit(_run_graph, query, namespaces, top_k, settings): "graph",
        }
        for fut in as_completed(f_map):
            label = f_map[fut]
            try:
                res = fut.result()
            except Exception as exc:  # noqa: BLE001
                RETRIEVAL_ERRORS.labels(branch=label).inc()
                branches[label] = f"error:{exc}"
                continue
            if label == "vector":
                vec_hits = res  # type: ignore[assignment]
            elif label == "bm25":
                bm_rows = res  # type: ignore[assignment]
            else:
                gr_rows = res  # type: ignore[assignment]

    if not settings.neo4j_enabled:
        branches["graph"] = "disabled"

    store: dict[str, RetrievalHit] = {}
    for h in vec_hits:
        _merge_branch(store, h.chunk_id, h.text, h.namespace, h.source, h.score, "vector")
    for cid, text, ns, src, sc in bm_rows:
        _merge_branch(store, cid, text, ns, src, sc, "bm25")
    for cid, sc, text, ns, src in gr_rows:
        _merge_branch(store, cid, text, ns, src, sc, "graph")

    fused = [h for h in store.values() if h.score >= score_threshold]
    fused.sort(key=lambda x: x.score, reverse=True)

    if use_rerank and fused:
        head_n = min(len(fused), settings.retrieval_rerank_top_pool)
        head = fused[:head_n]
        tail = fused[head_n:]
        docs = [h.text for h in head]
        try:
            rscores = rerank_pairs(query, docs, settings)
            for i, rs in enumerate(rscores):
                if i < len(head):
                    head[i].score = float(rs)
            head.sort(key=lambda x: x.score, reverse=True)
            fused = head + tail
        except Exception as exc:  # noqa: BLE001
            RETRIEVAL_ERRORS.labels(branch="rerank").inc()
            branches["rerank"] = f"error:{exc}"

    fused = fused[:top_k]
    RETRIEVAL_LATENCY_SECONDS.observe(time.perf_counter() - t0)

    if not fused:
        notice = (
            "检索未返回达到阈值的上下文（向量/BM25/图谱均无足够匹配）。"
            "请勿凭空编造事实；如需回答请明确说明缺乏知识库依据。"
        )
        return RetrievalResult(
            context_available=False,
            agent_notice=notice,
            hits=[],
            branches=branches,
        )

    return RetrievalResult(
        context_available=True,
        agent_notice="已从知识库检索到上下文，请基于摘录引用作答；摘录外勿臆测。",
        hits=fused,
        branches=branches,
    )
