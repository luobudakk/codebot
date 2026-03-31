from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings
from app.ingestion.qdrant_store import get_client

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    qdrant_status = "down"
    neo4j_status = "down"
    qdrant_error: str | None = None
    neo4j_error: str | None = None

    try:
        client = get_client(settings)
        client.get_collections()
        qdrant_status = "up"
    except Exception as exc:  # noqa: BLE001
        qdrant_error = str(exc)

    try:
        from neo4j import GraphDatabase

        drv = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        drv.verify_connectivity()
        drv.close()
        neo4j_status = "up"
    except Exception as exc:  # noqa: BLE001
        neo4j_error = str(exc)

    overall = "ok" if qdrant_status == "up" and neo4j_status == "up" else "degraded"
    if qdrant_status != "up":
        overall = "unhealthy"

    body: dict = {
        "status": overall,
        "qdrant": qdrant_status,
        "neo4j": neo4j_status,
    }
    if qdrant_error:
        body["qdrant_error"] = qdrant_error
    if neo4j_error:
        body["neo4j_error"] = neo4j_error
    return body
