from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from app.retrieval.bm25_index import bm25_index
from app.retrieval.reranker import rerank_pairs


@dataclass
class RetrievalHit:
    chunk_id: str
    text: str
    source: str
    score: float

    def model_dict(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "text": self.text,
            "source": self.source,
            "score": self.score,
        }


@dataclass
class RetrievalResult:
    context_available: bool
    agent_notice: str
    hits: List[RetrievalHit]


def retrieve_hybrid(query: str, namespace: str, top_k: int, score_threshold: float) -> RetrievalResult:
    raw = bm25_index.search(namespace=namespace, query=query, top_k=max(top_k, 20))
    if not raw:
        return RetrievalResult(
            context_available=False,
            agent_notice="知识库中暂无可用上下文，请先上传安全规范、历史案例或设计文档。",
            hits=[],
        )

    docs = [row[1] for row in raw]
    rerank_scores = rerank_pairs(query, docs)
    merged: List[RetrievalHit] = []
    for (chunk_id, text, source, bm25_score), rr_score in zip(raw, rerank_scores, strict=True):
        final_score = (0.6 * rr_score) + (0.4 * min(1.0, bm25_score / 10.0))
        if final_score >= score_threshold:
            merged.append(RetrievalHit(chunk_id=chunk_id, text=text, source=source, score=final_score))
    merged.sort(key=lambda x: x.score, reverse=True)
    merged = merged[:top_k]
    if not merged:
        return RetrievalResult(
            context_available=False,
            agent_notice="检索结果相关性不足，建议调整问题关键词或补充安全知识文档。",
            hits=[],
        )
    return RetrievalResult(
        context_available=True,
        agent_notice="已返回与问题最相关的安全知识上下文，请基于证据进行判断。",
        hits=merged,
    )


class InMemoryChunkRegistry:
    def __init__(self) -> None:
        self._chunks: Dict[str, dict] = {}

    def save(self, chunk_id: str, namespace: str, source: str, text: str) -> None:
        self._chunks[chunk_id] = {
            "chunk_id": chunk_id,
            "namespace": namespace,
            "source": source,
            "text": text,
        }

    def list_namespace(self, namespace: str) -> List[dict]:
        return [item for item in self._chunks.values() if item["namespace"] == namespace]

