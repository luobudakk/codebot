from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.agents.orchestrator import run_chat_stream, run_research_stream
from app.agents.sse import sse_line
from app.api.schemas_agents import AgentStreamRequest
from app.core.config import get_settings

router = APIRouter(tags=["agents"])


@router.post("/v1/agents/stream")
async def agents_stream(req: AgentStreamRequest):
    settings = get_settings()

    async def gen():
        if req.mode == "chat":
            stream_it = run_chat_stream(
                query=req.query.strip(),
                namespaces=req.namespaces or ["default"],
                settings=settings,
            )
        else:
            stream_it = run_research_stream(
                query=req.query.strip(),
                namespaces=req.namespaces or ["default"],
                settings=settings,
            )
        async for event, payload in stream_it:
            yield sse_line(event, payload)

    return StreamingResponse(gen(), media_type="text/event-stream; charset=utf-8")
