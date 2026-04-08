from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_scan_flow_returns_findings() -> None:
    client = TestClient(app)

    session = client.post("/api/v1/security/sessions", json={"title": "demo"})
    assert session.status_code == 201
    session_id = session.json()["id"]

    scan = client.post(
        "/api/v1/security/scans",
        json={
            "session_id": session_id,
            "source_name": "sample.py",
            "content": "subprocess.run(cmd, shell=True)\n",
        },
    )
    assert scan.status_code == 200
    job_id = scan.json()["job_id"]

    # Poll once for fast in-memory async completion.
    for _ in range(20):
        status = client.get(f"/api/v1/security/jobs/{job_id}")
        assert status.status_code == 200
        if status.json()["status"] in {"finished", "failed"}:
            break

    findings = client.get(f"/api/v1/security/sessions/{session_id}/findings")
    assert findings.status_code == 200
    rows = findings.json()
    assert len(rows) >= 1
    assert any(item["severity"] in {"critical", "high", "medium", "low", "info"} for item in rows)

