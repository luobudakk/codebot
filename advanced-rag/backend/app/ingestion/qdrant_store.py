from __future__ import annotations

import time
import uuid

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from app.core.config import Settings
from app.core.metrics import QDRANT_UPSERT_SECONDS
from app.ingestion.chunker import Chunk
from app.ingestion.models import IndexedChunk


def get_client(settings: Settings) -> QdrantClient:
    return QdrantClient(url=settings.qdrant_url)


def ensure_collection(client: QdrantClient, settings: Settings) -> None:
    collections = client.get_collections().collections
    names = {c.name for c in collections}
    if settings.qdrant_collection in names:
        return
    client.create_collection(
        collection_name=settings.qdrant_collection,
        vectors_config=qm.VectorParams(size=settings.qdrant_vector_size, distance=qm.Distance.COSINE),
    )


def upsert_chunks(
    client: QdrantClient,
    settings: Settings,
    namespace: str,
    source_filename: str,
    chunks: list[Chunk],
    vectors: list[list[float]],
) -> tuple[int, list[IndexedChunk]]:
    if len(chunks) != len(vectors):
        raise ValueError("chunks and vectors length mismatch")

    ensure_collection(client, settings)
    points: list[qm.PointStruct] = []
    indexed: list[IndexedChunk] = []
    for ch, vec in zip(chunks, vectors, strict=True):
        chunk_id = str(uuid.uuid4())
        points.append(
            qm.PointStruct(
                id=chunk_id,
                vector=vec,
                payload={
                    "chunk_id": chunk_id,
                    "namespace": namespace,
                    "source": source_filename,
                    "kind": ch.kind,
                    "chunk_index": ch.index,
                    "text": ch.text,
                },
            )
        )
        indexed.append(
            IndexedChunk(
                chunk_id=chunk_id,
                namespace=namespace,
                source=source_filename,
                text=ch.text,
                kind=ch.kind,
                chunk_index=ch.index,
            )
        )

    if not points:
        return 0, []

    t0 = time.perf_counter()
    client.upsert(collection_name=settings.qdrant_collection, points=points, wait=True)
    QDRANT_UPSERT_SECONDS.observe(time.perf_counter() - t0)
    return len(points), indexed
