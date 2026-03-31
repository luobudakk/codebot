from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_agents import router as agents_router
from app.api.routes_health import router as health_router
from app.api.routes_ingest import router as ingest_router
from app.api.routes_metrics import router as metrics_router
from app.api.routes_retrieve import router as retrieve_router
from app.core.config import get_settings
from app.ingestion.qdrant_store import ensure_collection, get_client
from app.retrieval.neo4j_graph import close_driver, ensure_graph_schema, get_driver


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    try:
        client = get_client(settings)
        ensure_collection(client, settings)
    except Exception:
        # Defer failures to /health and ingest; allow API to start if Qdrant is briefly down.
        pass
    if settings.neo4j_enabled:
        try:
            drv = get_driver(settings)
            if drv:
                ensure_graph_schema(drv)
        except Exception:
            pass
    yield
    try:
        close_driver()
    except Exception:
        pass


app = FastAPI(title="Advanced Multi-Agent RAG", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(metrics_router)
app.include_router(ingest_router)
app.include_router(retrieve_router)
app.include_router(agents_router)


@app.get("/")
def root() -> dict:
    return {"service": "advanced-rag", "docs": "/docs"}
