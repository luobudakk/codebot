from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from dataclasses import asdict

from app.agents.llm import async_llm_client, chat_complete, chat_stream
from app.agents.planner import Plan, PlanStep, build_plan
from app.agents.coordinator import Coordinator
from app.agents.summary import run_summary_stream
from app.core.config import Settings
from app.core.metrics import AGENT_RUNS, AGENT_STAGE_SECONDS
from app.retrieval.pipeline import retrieve_hybrid


def _truncate_context(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 20] + "\n…(truncated)"


def _format_hits(notice: str, hits: list) -> str:
    parts = [f"[系统提示] {notice}", ""]
    for i, h in enumerate(hits, 1):
        md = h.model_dict() if hasattr(h, "model_dict") else h
        src = md.get("source", "")
        txt = md.get("text", "")
        parts.append(f"--- 摘录 {i} ({src}) ---\n{txt}\n")
    return "\n".join(parts)


async def _retrieve_async(query: str, namespaces: list[str], settings: Settings):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        lambda: retrieve_hybrid(
            query=query,
            namespaces=namespaces,
            settings=settings,
            use_rerank=False,
        ),
    )


async def run_chat_stream(
    *,
    query: str,
    namespaces: list[str],
    settings: Settings,
) -> AsyncIterator[tuple[str, dict]]:
    t0 = time.perf_counter()
    ret = await _retrieve_async(query, namespaces, settings)
    dt = time.perf_counter() - t0
    AGENT_STAGE_SECONDS.labels(stage="retrieve").observe(dt)
    ctx = _format_hits(ret.agent_notice, ret.hits)
    ctx = _truncate_context(ctx, settings.agent_context_max_chars)
    yield (
        "retrieve",
        {
            "context_available": ret.context_available,
            "branches": ret.branches,
            "hit_count": len(ret.hits),
        },
    )

    client = async_llm_client(settings)
    system = (
        "你是一个谨慎的助手。若检索提示缺乏可靠上下文，请不要编造；"
        "明确说明知识库未覆盖，并给出泛化建议（标注为一般性经验）。"
    )
    user = f"用户问题：{query}\n\n知识库材料：\n{ctx}"
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    if client is None:
        AGENT_RUNS.labels(mode="chat", outcome="mock").inc()
        mock = (
            "（未配置 LLM_API_KEY：这是演示输出。）\n\n"
            + ("无可用的知识库上下文。" if not ret.context_available else ctx[:500])
        )
        for i in range(0, len(mock), 40):
            yield ("assistant_delta", {"token": mock[i : i + 40]})
            await asyncio.sleep(0.03)
        yield ("assistant_done", {"text": mock})
        yield ("done", {})
        return

    acc = ""
    t1 = time.perf_counter()
    async for tok in chat_stream(client, model=settings.llm_model, messages=messages, settings=settings):
        acc += tok
        yield ("assistant_delta", {"token": tok})
    AGENT_STAGE_SECONDS.labels(stage="chat_llm").observe(time.perf_counter() - t1)
    yield ("assistant_done", {"text": acc})
    AGENT_RUNS.labels(mode="chat", outcome="ok").inc()
    yield ("done", {})


async def run_research_stream(
    *,
    query: str,
    namespaces: list[str],
    settings: Settings,
) -> AsyncIterator[tuple[str, dict]]:
    t0 = time.perf_counter()
    ret = await _retrieve_async(query, namespaces, settings)
    AGENT_STAGE_SECONDS.labels(stage="retrieve").observe(time.perf_counter() - t0)
    context_block = _format_hits(ret.agent_notice, ret.hits)
    context_block = _truncate_context(context_block, settings.agent_context_max_chars)
    yield (
        "retrieve",
        {
            "context_available": ret.context_available,
            "branches": ret.branches,
            "hit_count": len(ret.hits),
        },
    )

    client = async_llm_client(settings)
    if client is None:
        AGENT_RUNS.labels(mode="research", outcome="mock").inc()
        yield ("error", {"message": "LLM_API_KEY 未配置，无法运行 Planner/专家流。"})
        yield ("done", {})
        return

    plan: Plan | None = None
    t1 = time.perf_counter()
    try:
        plan = await build_plan(
            client,
            user_query=query,
            context_notice=ret.agent_notice,
            context_snippets=context_block,
            settings=settings,
        )
    except Exception as exc:  # noqa: BLE001
        yield ("planner_error", {"message": str(exc)})
        plan = Plan(
            steps=[
                PlanStep("s1", "research_analyst", "界定问题与关键未知", []),
                PlanStep("s2", "fact_checker", "对照摘录做事实核对", ["s1"]),
                PlanStep("s3", "technical_expert", "给出技术实现路径与约束", ["s2"]),
                PlanStep("s4", "stakeholder_communicator", "用业务语言总结与建议", ["s3"]),
            ],
            rationale="Planner JSON 解析失败，已使用回退计划。",
        )
    AGENT_STAGE_SECONDS.labels(stage="planner").observe(time.perf_counter() - t1)

    yield ("planner", {"rationale": plan.rationale, "steps": [asdict(s) for s in plan.steps]})

    coordinator = Coordinator(
        client=client,
        settings=settings,
        query=query,
        context_block=context_block,
    )
    t_sum = time.perf_counter()
    acc = ""
    try:
        async for ev, payload in coordinator.run(plan):
            yield (ev, payload)
    except Exception as exc:  # noqa: BLE001
        yield ("error", {"message": f"coordinator failed: {exc}"})
        AGENT_RUNS.labels(mode="research", outcome="error").inc()
        yield ("done", {})
        return

    async for tok in run_summary_stream(
        client,
        settings=settings,
        query=query,
        specialist_outputs=coordinator.specialist_outputs,
    ):
        acc += tok
        yield ("summary_delta", {"token": tok})
    AGENT_STAGE_SECONDS.labels(stage="summary").observe(time.perf_counter() - t_sum)
    yield ("summary_done", {"text": acc})
    AGENT_RUNS.labels(mode="research", outcome="ok").inc()
    yield ("done", {})
