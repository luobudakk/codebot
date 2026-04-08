from __future__ import annotations

from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field


Severity = Literal["critical", "high", "medium", "low", "info"]


class SecuritySessionCreateRequest(BaseModel):
    title: str = Field(default="Code Security Review")


class SecuritySessionResponse(BaseModel):
    id: str
    title: str
    created_at: str


class ScanRequest(BaseModel):
    session_id: str
    source_name: str
    content: str


class FindingResponse(BaseModel):
    id: str
    severity: Severity
    title: str
    category: str
    evidence: str
    remediation: str
    rule_id: str


class ScanStartResponse(BaseModel):
    job_id: str
    status: str
    session_id: str


class JobStatusResponse(BaseModel):
    id: str
    session_id: str
    status: str
    progress: int
    outputs: List[Dict[str, Any]]
    error_message: str = ""


class RagIngestRequest(BaseModel):
    namespace: str = "default"
    source: str
    content: str


class RagIngestResponse(BaseModel):
    namespace: str
    source: str
    chunks_indexed: int


class RagRetrieveRequest(BaseModel):
    namespace: str = "default"
    query: str
    top_k: int = Field(default=5, ge=1, le=20)


class RagHitResponse(BaseModel):
    chunk_id: str
    text: str
    source: str
    score: float


class RagRetrieveResponse(BaseModel):
    context_available: bool
    agent_notice: str
    hits: List[RagHitResponse]

