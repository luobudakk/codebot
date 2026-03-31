from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from app.core.metrics import metrics_payload

router = APIRouter(tags=["metrics"])


@router.get("/metrics")
def metrics() -> Response:
    data, ctype = metrics_payload()
    return Response(content=data, media_type=ctype)
