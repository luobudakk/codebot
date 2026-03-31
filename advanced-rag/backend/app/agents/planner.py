from __future__ import annotations

import json
import re
from dataclasses import dataclass

from openai import AsyncOpenAI

from app.agents.experts import ALLOWED_EXPERT_KEYS
from app.core.config import Settings


@dataclass
class PlanStep:
    step_id: str
    expert: str
    goal: str
    depends_on: list[str]


@dataclass
class Plan:
    steps: list[PlanStep]
    rationale: str


def _extract_json_blob(text: str) -> dict:
    text = text.strip()
    if "```" in text:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if m:
            text = m.group(1).strip()
    return json.loads(text)


async def build_plan(
    client: AsyncOpenAI,
    *,
    user_query: str,
    context_notice: str,
    context_snippets: str,
    settings: Settings,
) -> Plan:
    allowed = ", ".join(ALLOWED_EXPERT_KEYS)
    prompt = f"""你是 Planner。根据用户问题与检索提示，设计多专家协作步骤。
【用户问题】
{user_query}

【检索提示/状态】
{context_notice}

【摘录（可能为空）】
{context_snippets[:8000]}

只允许使用这些专家 key（小写）：{allowed}

输出**仅** JSON（不要 Markdown），格式：
{{
  "rationale": "一句话说明为何如此分工",
  "steps": [
    {{"id":"s1","expert":"research_analyst","goal":"...","depends_on":[]}},
    {{"id":"s2","expert":"fact_checker","goal":"...","depends_on":["s1"]}}
  ]
}}
要求：
- 至少 4 步、至多 8 步；depends_on 必须指向已出现 step id，或为空数组。
- expert 必须来自允许列表。
- 依赖必须无环；优先让可并行步骤 depends_on 保持一致以并行。"""
    raw = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "你只输出合法 JSON 对象。"},
            {"role": "user", "content": prompt},
        ],
        temperature=min(settings.llm_temperature, 0.4),
        max_tokens=min(settings.llm_max_tokens, 2048),
    )
    content = raw.choices[0].message.content or "{}"
    data = _extract_json_blob(content)
    steps_in = data.get("steps") or []
    steps: list[PlanStep] = []
    for s in steps_in:
        steps.append(
            PlanStep(
                step_id=str(s.get("id", "")),
                expert=str(s.get("expert", "")).strip(),
                goal=str(s.get("goal", "")).strip(),
                depends_on=[str(x) for x in (s.get("depends_on") or [])],
            )
        )
    if not steps:
        steps = [
            PlanStep("s1", "research_analyst", "界定问题与信息需求", []),
            PlanStep("s2", "fact_checker", "核对与摘录一致性", ["s1"]),
            PlanStep("s3", "technical_expert", "给出可行技术路径", ["s2"]),
            PlanStep("s4", "stakeholder_communicator", "面向业务的总结", ["s3"]),
        ]
    # 校验专家 key
    for i, st in enumerate(steps):
        if not st.step_id:
            st.step_id = f"s{i+1}"
        if st.expert not in ALLOWED_EXPERT_KEYS:
            st.expert = "research_analyst"
    rationale = str(data.get("rationale", "")).strip() or "自动回退的最小可行计划。"
    return Plan(steps=steps[:8], rationale=rationale)


def plan_to_waves(plan: Plan) -> list[list[PlanStep]]:
    remaining = {s.step_id: s for s in plan.steps if s.step_id}
    waves: list[list[PlanStep]] = []
    completed: set[str] = set()
    while remaining:
        wave = [
            s
            for s in remaining.values()
            if all(dep in completed for dep in s.depends_on)
        ]
        if not wave:
            raise ValueError("invalid plan dependencies (cycle or missing ids)")
        for s in wave:
            completed.add(s.step_id)
            del remaining[s.step_id]
        waves.append(wave)
    return waves
