"""Phase B: 向量 + BM25 + Neo4j 图谱检索、可选 cross-encoder rerank、检索失败回退说明。"""

from app.retrieval.pipeline import retrieve_hybrid

__all__ = ["retrieve_hybrid"]
