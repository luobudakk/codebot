from __future__ import annotations

from app.api.schemas_retrieval import RetrieveRequest
from app.retrieval.bm25_index import NamespaceBM25Index
from app.retrieval.pipeline import RetrievalHit, _merge_branch, _minmax_norm


def test_minmax_norm():
    assert _minmax_norm([1.0, 2.0]) == [0.0, 1.0]
    assert _minmax_norm([5.0, 5.0]) == [1.0, 1.0]


def test_merge_branch_prefers_higher_score():
    store: dict[str, RetrievalHit] = {}
    _merge_branch(store, "a", "t1", "ns", "s", 0.5, "vector")
    _merge_branch(store, "a", "t2longer", "ns", "s", 0.9, "bm25")
    assert store["a"].score == 0.9
    assert "vector" in store["a"].routes and "bm25" in store["a"].routes


def test_bm25_index_search():
    idx = NamespaceBM25Index()
    idx.add_documents(
        "ns1",
        [
            ("id1", "python fastapi tutorial"),
            ("id2", "cooking pasta recipes"),
        ],
    )
    ranked = idx.search("ns1", "fastapi python", top_k=5)
    assert ranked and ranked[0][0] == "id1"


def test_retrieve_request_schema():
    body = RetrieveRequest(query="q", namespaces=["default", "team-a"])
    assert body.top_k is None
