from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_root_and_metrics():
    client = TestClient(app)
    r = client.get("/")
    assert r.status_code == 200
    assert r.json().get("service") == "advanced-rag"

    m = client.get("/metrics")
    assert m.status_code == 200
    assert b"ingest_requests_total" in m.content or b"# HELP" in m.content


def test_health_structure():
    client = TestClient(app)
    h = client.get("/health")
    assert h.status_code == 200
    body = h.json()
    assert "status" in body
    assert body.get("qdrant") in ("up", "down")
    assert body.get("neo4j") in ("up", "down")
