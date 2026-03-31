from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.schemas_retrieval import RetrievalHitOut, RetrieveRequest, RetrieveResponse
from app.core.config import get_settings
from app.core.metrics import RETRIEVAL_REQUESTS
from app.retrieval.pipeline import retrieve_hybrid

router = APIRouter(tags=["retrieve"])


@router.post("/v1/retrieve", response_model=RetrieveResponse)
def retrieve(req: RetrieveRequest) -> RetrieveResponse:
    settings = get_settings()
    if not req.namespaces:
        raise HTTPException(status_code=400, detail="namespaces must be non-empty")
    try:
        result = retrieve_hybrid(
            query=req.query.strip(),
            namespaces=req.namespaces,
            settings=settings,
            top_k=req.top_k,
            score_threshold=req.score_threshold,
            use_rerank=req.rerank,
        )
    except Exception as exc:  # noqa: BLE001
        RETRIEVAL_REQUESTS.labels(outcome="error").inc()
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    RETRIEVAL_REQUESTS.labels(outcome="success" if result.context_available else "empty").inc()
    return RetrieveResponse(
        context_available=result.context_available,
        agent_notice=result.agent_notice,
        hits=[RetrievalHitOut(**h.model_dict()) for h in result.hits],
        branches=result.branches,
    )
