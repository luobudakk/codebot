from __future__ import annotations

from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import Settings


def async_llm_client(settings: Settings) -> AsyncOpenAI | None:
    if not (settings.llm_api_key or "").strip():
        return None
    kwargs: dict = {"api_key": settings.llm_api_key}
    if settings.llm_base_url:
        kwargs["base_url"] = settings.llm_base_url
    return AsyncOpenAI(**kwargs)


async def chat_complete(
    client: AsyncOpenAI,
    *,
    model: str,
    messages: list[dict[str, str]],
    settings: Settings,
) -> str:
    resp = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        stream=False,
    )
    choice = resp.choices[0]
    return (choice.message.content or "").strip()


async def chat_stream(
    client: AsyncOpenAI,
    *,
    model: str,
    messages: list[dict[str, str]],
    settings: Settings,
) -> AsyncIterator[str]:
    stream = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta
