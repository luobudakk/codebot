from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import router
from app.services import ServiceContainer

settings = get_settings()
container = ServiceContainer(settings=settings)

app = FastAPI(
    title="Code Security Runtime",
    version="1.0.0",
    description="Enterprise-oriented code security review platform with integrated RAG.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[item.strip() for item in settings.cors_allow_origins.split(",") if item.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(router)


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}

