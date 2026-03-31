from __future__ import annotations

import time

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.config import get_settings
from app.core.metrics import (
    INGEST_CHUNKS,
    INGEST_DURATION_SECONDS,
    INGEST_ERRORS,
    INGEST_REQUESTS,
    NEO4J_WRITE_ERRORS,
)
from app.ingestion.chunker import hybrid_chunk
from app.ingestion.embeddings import encode_dense
from app.ingestion.parser import ParseError, parse_upload
from app.ingestion.qdrant_store import get_client, upsert_chunks
from app.retrieval.bm25_index import bm25_index
from app.retrieval.neo4j_graph import get_driver, write_indexed_chunks

router = APIRouter(tags=["ingest"])


@router.post("/v1/ingest/upload")
async def ingest_upload(
    namespace: str = "default",
    file: UploadFile = File(...),
) -> dict:
    settings = get_settings()
    t0 = time.perf_counter()
    try:
        raw = await file.read()
        if not raw:
            INGEST_REQUESTS.labels(namespace=namespace, outcome="empty").inc()
            raise HTTPException(status_code=400, detail="Empty file")

        text, source_name = parse_upload(file.filename or "upload", raw)
        chunks = hybrid_chunk(text, settings)
        if not chunks:
            INGEST_REQUESTS.labels(namespace=namespace, outcome="no_chunks").inc()
            return {
                "namespace": namespace,
                "source": source_name,
                "chunks_indexed": 0,
                "collection": settings.qdrant_collection,
                "message": "No chunks produced (empty document after parse?)",
            }

        vectors = encode_dense([c.text for c in chunks])
        client = get_client(settings)
        n, indexed = upsert_chunks(client, settings, namespace, source_name, chunks, vectors)

        bm25_index.add_documents(namespace, [(ic.chunk_id, ic.text) for ic in indexed])
        if settings.neo4j_enabled:
            try:
                drv = get_driver(settings)
                if drv:
                    write_indexed_chunks(drv, indexed)
            except Exception:
                NEO4J_WRITE_ERRORS.labels(stage="ingest").inc()

        INGEST_CHUNKS.labels(namespace=namespace).inc(n)
        INGEST_REQUESTS.labels(namespace=namespace, outcome="success").inc()
        INGEST_DURATION_SECONDS.observe(time.perf_counter() - t0)
        return {
            "namespace": namespace,
            "source": source_name,
            "chunks_indexed": n,
            "collection": settings.qdrant_collection,
            "neo4j": "skipped" if not settings.neo4j_enabled else "attempted",
        }
    except ParseError as exc:
        INGEST_ERRORS.labels(stage="parse").inc()
        INGEST_REQUESTS.labels(namespace=namespace, outcome="error").inc()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        INGEST_REQUESTS.labels(namespace=namespace, outcome="error").inc()
        raise
    except Exception as exc:  # noqa: BLE001
        INGEST_ERRORS.labels(stage="pipeline").inc()
        INGEST_REQUESTS.labels(namespace=namespace, outcome="error").inc()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
