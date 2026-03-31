from __future__ import annotations

from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.agents.experts import expert_system_message
from app.agents.llm import chat_complete, chat_stream
from app.agents.planner import PlanStep
from app.core.config import Settings


def build_specialist_messages(
    *,
    query: str,
    context_block: str,
    step: PlanStep,
    prior: dict[str, str],
) -> list[dict[str, str]]:
    prior_txt = "\n".join(f"[{k}]:\n{v}\n" for k, v in prior.items()) or "（无）"
    user = (
        f"用户问题：{query}\n\n"
        f"你的本轮目标：{step.goal}\n\n"
        f"知识库材料：\n{context_block}\n\n"
        f"前序专家输出（按 step id）：\n{prior_txt}"
    )
    return [
        {"role": "system", "content": expert_system_message(step.expert)},
        {"role": "user", "content": user},
    ]


async def run_specialist_stream(
    client: AsyncOpenAI,
    *,
    settings: Settings,
    query: str,
    context_block: str,
    step: PlanStep,
    prior: dict[str, str],
) -> AsyncIterator[tuple[str, dict]]:
    messages = build_specialist_messages(
        query=query, context_block=context_block, step=step, prior=prior
    )
    acc = ""
    async for tok in chat_stream(client, model=settings.llm_model, messages=messages, settings=settings):
        acc += tok
        yield (
            "expert_delta",
            {"step_id": step.step_id, "expert": step.expert, "token": tok},
        )
    yield (
        "expert_done",
        {
            "step_id": step.step_id,
            "expert": step.expert,
            "text": acc,
        },
    )


async def run_specialist_block(
    client: AsyncOpenAI,
    *,
    settings: Settings,
    query: str,
    context_block: str,
    step: PlanStep,
    prior: dict[str, str],
) -> tuple[str, str, str]:
    messages = build_specialist_messages(
        query=query, context_block=context_block, step=step, prior=prior
    )
    text = await chat_complete(
        client,
        model=settings.llm_model,
        messages=messages,
        settings=settings,
    )
    return step.step_id, step.expert, text
