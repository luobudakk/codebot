from __future__ import annotations

from pydantic import BaseModel, Field


class RetrieveRequest(BaseModel):
    query: str = Field(..., min_length=1)
    namespaces: list[str] = Field(default_factory=lambda: ["default"])
    top_k: int | None = Field(default=None, ge=1, le=500)
    score_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    rerank: bool | None = Field(default=None)


class RetrievalHitOut(BaseModel):
    chunk_id: str
    text: str
    namespace: str
    source: str
    score: float
    routes: list[str]


class RetrieveResponse(BaseModel):
    context_available: bool
    agent_notice: str
    hits: list[RetrievalHitOut]
    branches: dict[str, str]
