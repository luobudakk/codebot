from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

INGEST_REQUESTS = Counter(
    "ingest_requests_total",
    "Ingest HTTP requests",
    labelnames=("namespace", "outcome"),
)
INGEST_CHUNKS = Counter(
    "ingest_chunks_total",
    "Chunks indexed into vector store",
    labelnames=("namespace",),
)
INGEST_ERRORS = Counter(
    "ingest_errors_total",
    "Ingest pipeline errors",
    labelnames=("stage",),
)
INGEST_DURATION_SECONDS = Histogram(
    "ingest_duration_seconds",
    "End-to-end ingest latency",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120),
)
QDRANT_UPSERT_SECONDS = Histogram(
    "qdrant_upsert_seconds",
    "Qdrant upsert latency per batch",
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
RETRIEVAL_LATENCY_SECONDS = Histogram(
    "retrieval_latency_seconds",
    "End-to-end retrieval latency",
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30),
)
RETRIEVAL_REQUESTS = Counter(
    "retrieval_requests_total",
    "Retrieve API calls",
    labelnames=("outcome",),
)
RETRIEVAL_ERRORS = Counter(
    "retrieval_errors_total",
    "Retrieve branch errors",
    labelnames=("branch",),
)
NEO4J_WRITE_ERRORS = Counter(
    "neo4j_write_errors_total",
    "Neo4j graph write failures during ingest",
    labelnames=("stage",),
)
AGENT_RUNS = Counter(
    "agent_runs_total",
    "Multi-agent SSE pipeline runs",
    labelnames=("mode", "outcome"),
)
AGENT_STAGE_SECONDS = Histogram(
    "agent_stage_seconds",
    "Agent pipeline stage latency",
    labelnames=("stage",),
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300),
)


def metrics_payload() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
