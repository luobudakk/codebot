from __future__ import annotations

from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.agents.llm import chat_stream
from app.core.config import Settings


def build_summary_messages(*, query: str, specialist_outputs: dict[str, str]) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "你是「总括」代理：整合专家输出形成最终答复。"
                "若知识库不可用或专家表明无依据，必须在结论中显著提示。"
                "结构：结论 / 关键理由 / 风险与不确定 / 下一步。"
            ),
        },
        {
            "role": "user",
            "content": f"用户问题：{query}\n\n专家输出汇总：\n"
            + "\n".join(f"[{k}]: {v}" for k, v in specialist_outputs.items()),
        },
    ]


async def run_summary_stream(
    client: AsyncOpenAI,
    *,
    settings: Settings,
    query: str,
    specialist_outputs: dict[str, str],
) -> AsyncIterator[str]:
    messages = build_summary_messages(query=query, specialist_outputs=specialist_outputs)
    async for tok in chat_stream(
        client,
        model=settings.llm_model,
        messages=messages,
        settings=settings,
    ):
        yield tok
