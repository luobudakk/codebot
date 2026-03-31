from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.agents.planner import Plan, plan_to_waves
from app.agents.specialist import run_specialist_block, run_specialist_stream
from app.core.config import Settings
from app.core.metrics import AGENT_STAGE_SECONDS


class Coordinator:
    """Explicit coordinator role for wave-based specialist execution."""

    def __init__(
        self,
        *,
        client: AsyncOpenAI,
        settings: Settings,
        query: str,
        context_block: str,
    ) -> None:
        self._client = client
        self._settings = settings
        self._query = query
        self._context_block = context_block
        self._prior: dict[str, str] = {}

    @property
    def specialist_outputs(self) -> dict[str, str]:
        return self._prior

    async def run(self, plan: Plan) -> AsyncIterator[tuple[str, dict]]:
        waves = plan_to_waves(plan)
        yield (
            "coordinator",
            {"status": "started", "wave_count": len(waves), "step_count": len(plan.steps)},
        )

        for wave in waves:
            yield ("wave", {"parallel": len(wave) > 1, "steps": [s.step_id for s in wave]})

            if len(wave) == 1:
                step = wave[0]
                t_ex = time.perf_counter()
                async for ev, payload in run_specialist_stream(
                    self._client,
                    settings=self._settings,
                    query=self._query,
                    context_block=self._context_block,
                    step=step,
                    prior=self._prior,
                ):
                    yield (ev, payload)
                    if ev == "expert_done":
                        self._prior[step.step_id] = str(payload.get("text", ""))
                AGENT_STAGE_SECONDS.labels(stage="expert").observe(time.perf_counter() - t_ex)
            else:
                t_ex = time.perf_counter()
                tasks = [
                    run_specialist_block(
                        self._client,
                        settings=self._settings,
                        query=self._query,
                        context_block=self._context_block,
                        step=st,
                        prior=self._prior.copy(),
                    )
                    for st in wave
                ]
                results = await asyncio.gather(*tasks)
                for step_id, expert, text in results:
                    self._prior[step_id] = text
                    yield (
                        "expert_done",
                        {"step_id": step_id, "expert": expert, "text": text, "parallel": True},
                    )
                AGENT_STAGE_SECONDS.labels(stage="expert_parallel").observe(
                    time.perf_counter() - t_ex
                )

        yield ("coordinator", {"status": "done", "specialist_count": len(self._prior)})
