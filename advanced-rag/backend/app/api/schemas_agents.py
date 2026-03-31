from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AgentStreamRequest(BaseModel):
    query: str = Field(..., min_length=1)
    mode: Literal["chat", "research"] = "chat"
    namespaces: list[str] = Field(default_factory=lambda: ["default"])
