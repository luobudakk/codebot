from __future__ import annotations

from dataclasses import dataclass

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from app.core.config import Settings


@dataclass(frozen=True)
class VectorHit:
    chunk_id: str
    score: float
    text: str
    namespace: str
    source: str


def vector_search(
    client: QdrantClient,
    settings: Settings,
    query_vector: list[float],
    namespaces: list[str],
    top_k: int,
    score_threshold: float | None,
) -> list[VectorHit]:
    if not namespaces:
        return []
    flt = qm.Filter(
        must=[
            qm.FieldCondition(
                key="namespace",
                match=qm.MatchAny(any=namespaces),
            )
        ]
    )
    # qdrant-client API differs across versions:
    # - older: client.search(...)
    # - newer: client.query_points(...)
    if hasattr(client, "search"):
        kwargs: dict = {
            "collection_name": settings.qdrant_collection,
            "query_vector": query_vector,
            "query_filter": flt,
            "limit": top_k,
            "with_payload": True,
        }
        if score_threshold is not None:
            kwargs["score_threshold"] = score_threshold
        res = client.search(**kwargs)
    else:
        kwargs = {
            "collection_name": settings.qdrant_collection,
            "query": query_vector,
            "query_filter": flt,
            "limit": top_k,
            "with_payload": True,
        }
        if score_threshold is not None:
            kwargs["score_threshold"] = score_threshold
        qp = client.query_points(**kwargs)
        res = qp.points
    hits: list[VectorHit] = []
    for r in res:
        pl = r.payload or {}
        cid = pl.get("chunk_id") or str(r.id)
        text = pl.get("text") or ""
        hits.append(
            VectorHit(
                chunk_id=str(cid),
                score=float(r.score),
                text=str(text),
                namespace=str(pl.get("namespace", "")),
                source=str(pl.get("source", "")),
            )
        )
    return hits
