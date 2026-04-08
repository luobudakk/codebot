from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_rag_ingest_and_retrieve() -> None:
    client = TestClient(app)

    ingest = client.post(
        "/api/v1/rag/ingest",
        json={
            "namespace": "security",
            "source": "guide.md",
            "content": "SQL 查询必须参数化，禁止字符串拼接。",
        },
    )
    assert ingest.status_code == 200
    assert ingest.json()["chunks_indexed"] >= 1

    retrieve = client.post(
        "/api/v1/rag/retrieve",
        json={"namespace": "security", "query": "怎么防止SQL注入", "top_k": 3},
    )
    assert retrieve.status_code == 200
    payload = retrieve.json()
    assert "agent_notice" in payload
    assert "hits" in payload

