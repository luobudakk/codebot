from __future__ import annotations

import json
from typing import Generator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.contracts import (
    FindingResponse,
    JobStatusResponse,
    RagIngestRequest,
    RagIngestResponse,
    RagRetrieveRequest,
    RagRetrieveResponse,
    ScanRequest,
    ScanStartResponse,
    SecuritySessionCreateRequest,
    SecuritySessionResponse,
)
from app.services import ServiceContainer

router = APIRouter(prefix="/api/v1")


def get_container() -> ServiceContainer:
    from app.main import container

    return container


@router.post("/security/sessions", response_model=SecuritySessionResponse, status_code=201)
def create_security_session(
    payload: SecuritySessionCreateRequest,
    container: ServiceContainer = Depends(get_container),
) -> SecuritySessionResponse:
    session = container.create_session(payload.title)
    return SecuritySessionResponse(id=session.id, title=session.title, created_at=session.created_at)


@router.post("/security/scans", response_model=ScanStartResponse)
def start_scan(
    payload: ScanRequest,
    container: ServiceContainer = Depends(get_container),
) -> ScanStartResponse:
    try:
        job = container.start_scan(
            session_id=payload.session_id,
            source_name=payload.source_name,
            content=payload.content,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ScanStartResponse(job_id=job.id, status=job.status, session_id=job.session_id)


@router.get("/security/sessions/{session_id}/findings", response_model=list[FindingResponse])
def list_findings(
    session_id: str,
    container: ServiceContainer = Depends(get_container),
) -> list[FindingResponse]:
    rows = container.list_findings(session_id)
    return [
        FindingResponse(
            id=item.id,
            severity=item.severity,
            title=item.title,
            category=item.category,
            evidence=item.evidence,
            remediation=item.remediation,
            rule_id=item.rule_id,
        )
        for item in rows
    ]


@router.get("/security/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(
    job_id: str,
    container: ServiceContainer = Depends(get_container),
) -> JobStatusResponse:
    row = container.jobs.jobs.get(job_id)
    if row is None:
        raise HTTPException(status_code=404, detail="job_not_found")
    return JobStatusResponse(
        id=row.id,
        session_id=row.session_id,
        status=row.status,
        progress=row.progress,
        outputs=row.outputs,
        error_message=row.error_message,
    )


@router.get("/security/jobs/{job_id}/events")
def stream_job_events(
    job_id: str,
    container: ServiceContainer = Depends(get_container),
):
    if job_id not in container.jobs.jobs:
        raise HTTPException(status_code=404, detail="job_not_found")

    def event_generator() -> Generator[str, None, None]:
        for payload in container.jobs.stream(job_id):
            yield f"data: {payload}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/rag/ingest", response_model=RagIngestResponse)
def rag_ingest(
    payload: RagIngestRequest,
    container: ServiceContainer = Depends(get_container),
) -> RagIngestResponse:
    try:
        count = container.ingest_knowledge(
            namespace=payload.namespace,
            source=payload.source,
            content=payload.content,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RagIngestResponse(namespace=payload.namespace, source=payload.source, chunks_indexed=count)


@router.post("/rag/retrieve", response_model=RagRetrieveResponse)
def rag_retrieve(
    payload: RagRetrieveRequest,
    container: ServiceContainer = Depends(get_container),
) -> RagRetrieveResponse:
    result = container.retrieve_knowledge(
        namespace=payload.namespace,
        query=payload.query,
        top_k=payload.top_k,
    )
    return RagRetrieveResponse(
        context_available=result.context_available,
        agent_notice=result.agent_notice,
        hits=result.hits,
    )

