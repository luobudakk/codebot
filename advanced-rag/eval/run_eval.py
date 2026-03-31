#!/usr/bin/env python3
"""
Phase D：评测脚本 — 检索 → 生成 → LLM-as-Judge（0–1 分）。

用法（在仓库根目录）:
  python eval/run_eval.py --input fixtures/eval_sample.jsonl --out eval/out.csv

需要环境变量见根目录 .env.example（LLM_API_KEY 等）。
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from openai import OpenAI  # noqa: E402

from app.core.config import Settings  # noqa: E402
from app.retrieval.pipeline import retrieve_hybrid  # noqa: E402


def judge_score(
    *,
    client: OpenAI,
    model: str,
    question: str,
    answer: str,
    reference: str | None,
) -> tuple[float, str]:
    ref = reference or "（无标准答案，按合理性与自洽性评分）"
    prompt = f"""你是严格评委。请根据问题、模型答案与参考答案（可为空）打分。
返回 JSON 对象，仅含字段: score (0到1的小数), rationale (简短中文理由)。

【问题】
{question}

【参考答案】
{ref}

【模型答案】
{answer}
"""
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "只输出合法 JSON。"},
            {"role": "user", "content": prompt},
        ],
        temperature=0,
        max_tokens=512,
    )
    raw = (resp.choices[0].message.content or "{}").strip()
    if "```" in raw:
        import re

        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        if m:
            raw = m.group(1).strip()
    data = json.loads(raw)
    score = float(data.get("score", 0))
    score = max(0.0, min(1.0, score))
    rationale = str(data.get("rationale", "")).strip()
    return score, rationale


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="JSONL，每行含 question / 可选 reference_answer / id")
    ap.add_argument("--out", default="eval/out.csv")
    ap.add_argument("--namespaces", default="default", help="逗号分隔")
    args = ap.parse_args()

    settings = Settings()
    if not (settings.llm_api_key or "").strip():
        print("缺少 LLM_API_KEY，退出。", file=sys.stderr)
        sys.exit(2)

    kwargs: dict = {"api_key": settings.llm_api_key}
    if settings.llm_base_url:
        kwargs["base_url"] = settings.llm_base_url
    client = OpenAI(**kwargs)
    judge_model = settings.judge_model or settings.llm_model
    namespaces = [x.strip() for x in args.namespaces.split(",") if x.strip()]

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf-8") as fc:
        w = csv.writer(fc)
        w.writerow(["id", "question", "score", "rationale", "answer_preview"])

        with open(args.input, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                qid = str(row.get("id", ""))
                question = str(row["question"])
                ref = row.get("reference_answer")

                ret = retrieve_hybrid(
                    query=question,
                    namespaces=namespaces,
                    settings=settings,
                    use_rerank=False,
                )
                ctx_parts = [ret.agent_notice, ""]
                for h in ret.hits[:20]:
                    m = h.model_dict()
                    ctx_parts.append(f"--- {m.get('source')} ---\n{m.get('text', '')}\n")
                context = "\n".join(ctx_parts)[: settings.agent_context_max_chars]

                ans_resp = client.chat.completions.create(
                    model=settings.llm_model,
                    messages=[
                        {
                            "role": "system",
                            "content": "你是助手。若上下文不足请明确说明，勿编造。",
                        },
                        {
                            "role": "user",
                            "content": f"问题：{question}\n\n材料：\n{context}",
                        },
                    ],
                    temperature=settings.llm_temperature,
                    max_tokens=min(settings.llm_max_tokens, 2048),
                )
                answer = (ans_resp.choices[0].message.content or "").strip()
                score, rationale = judge_score(
                    client=client,
                    model=judge_model,
                    question=question,
                    answer=answer,
                    reference=str(ref) if ref is not None else None,
                )
                w.writerow(
                    [
                        qid,
                        question.replace("\n", " ")[:200],
                        f"{score:.4f}",
                        rationale.replace("\n", " ")[:500],
                        answer.replace("\n", "\\n")[:400],
                    ]
                )
                print(f"[{qid}] score={score:.3f}")


if __name__ == "__main__":
    main()
