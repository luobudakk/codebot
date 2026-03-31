"""Planner → Coordinator → parallel Specialists (TaskExecutor) → Summary."""

from __future__ import annotations

import asyncio
import copy
import json
import re
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import HTTPException, UploadFile

from app.config_util import deep_merge
from app.executor import TaskExecutor, WorkerPolicy
from app.nanobot_helpers import iter_stdout_chunks, run_nanobot_to_completion, nanobot_env, strip_ansi

# Route → nanobot runtime patch (tool / behavior policy for “tool routing” at config layer).
ROUTE_PROFILES: dict[str, dict[str, Any]] = {
    "general": {},
    "deps": {
        "tools": {"exec": {"enable": True, "timeout": 300}},
    },
    "secrets": {
        "tools": {"exec": {"enable": False}},
    },
    "auth": {
        "tools": {"exec": {"enable": True, "timeout": 180}},
    },
    "injection": {
        "tools": {"exec": {"enable": True, "timeout": 180}},
    },
}

_ROUTE_KEYS = frozenset(ROUTE_PROFILES.keys())

_TASK_PAD: list[dict[str, str]] = [
    {"id": "authn-authz", "focus": "认证与授权", "hint": "会话、令牌、权限边界与 IDOR。", "route": "auth"},
    {"id": "input-validation", "focus": "注入与输入校验", "hint": "SQL/命令/模板注入与危险 API。", "route": "injection"},
    {"id": "deps-supply-chain", "focus": "依赖与供应链", "hint": "lockfile、已知漏洞与许可证。", "route": "deps"},
    {"id": "secrets-config", "focus": "密钥与敏感配置", "hint": "硬编码凭据、.env、日志脱敏。", "route": "secrets"},
    {"id": "business-access", "focus": "业务逻辑与关键操作", "hint": "工作流绕过、金额/状态篡改风险。", "route": "general"},
]


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sse_line(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def pipeline_job_dir(data_dir: Path, job_id: str) -> Path:
    return (data_dir / "pipelines" / job_id).resolve()


def _stderr_tail(s: str, max_len: int = 4000) -> str:
    s = s or ""
    if len(s) <= max_len:
        return s
    return s[-max_len:]


def normalize_route(route: str | None) -> str:
    r = (route or "general").strip().lower()
    return r if r in _ROUTE_KEYS else "general"


def _runtime_slug(task_id: str) -> str:
    return re.sub(r"[^\w\-]+", "_", task_id)[:80] or "task"


def _strip_nanobot_cli_noise(text: str) -> str:
    """去掉 nanobot CLI 在 JSON 前的 Using config / 横幅，便于解析 Planner 输出。"""
    t = text or ""
    m = re.search(r"\{\s*\"tasks\"\s*:", t)
    if m:
        return t[m.start() :].strip()
    return t.strip()


def _strip_stdout_banners_for_summary(text: str) -> str:
    return re.sub(
        r"(?is)^Using config:.*?\n\s*🐈\s*nanobot\s*\r?\n",
        "",
        (text or "").lstrip(),
        count=1,
    ).strip()


def _nanobot_stdout_looks_like_api_error(text: str) -> bool:
    """
    Nanobot 在 LLM/渠道报错或超时时仍可能 exit 0，只把错误打在 stdout。
    用于纠正「假成功」与 metrics。
    """
    if not (text or "").strip():
        return False
    t = (text or "").lower()
    # 常见：Error calling LLM: Request timed out.
    if "error calling llm" in t:
        return True
    if "request timed out" in t and "llm" in t:
        return True
    if "sorry, you have reached" in t and ("quota" in t or "limit" in t):
        return True
    if "free model" in t and "quota" in t:
        return True
    if "please switch to a paid model" in t:
        return True
    if "aihubmix" in t and "error" in t:
        return True
    # 同时去掉空格/换行，兼容形如 "Authentica\r\ntion required" 的分裂文本
    compact = re.sub(r"\s+", "", t)
    if "authenticationrequired" in compact:
        return True
    if '"type":"' in compact or '"type": "' in text.lower():
        if "api_error" in compact or "provider_error" in compact or "ratelimit" in compact:
            return True
    head = t[:2500]
    if "error:" in head and '"error"' in head:
        if any(k in t for k in ("quota", "rate limit", "429", "exhausted", "insufficient_quota", "billing")):
            return True
    return False


def _upstream_failure_label(stdout: str) -> str:
    """与 _nanobot_stdout_looks_like_api_error 配套，便于 state / UI 区分超时与额度。"""
    t = (stdout or "").lower()
    if "error calling llm" in t or ("request timed out" in t and "llm" in t):
        return "upstream_llm_timeout"
    if "authenticationrequired" in re.sub(r"\s+", "", t):
        return "upstream_authentication_required"
    return "upstream_llm_or_quota"


def parse_plan_json(text: str) -> dict[str, Any]:
    t = _strip_nanobot_cli_noise(strip_ansi((text or "").strip()))
    candidates: list[str] = []
    if t:
        candidates.append(t)
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", t, re.IGNORECASE)
    if fence:
        candidates.insert(0, fence.group(1).strip())
    brace = re.search(r"(\{[\s\S]*\})\s*$", t)
    if brace:
        candidates.insert(0, brace.group(1).strip())

    for cand in candidates:
        try:
            data = json.loads(cand)
            if not isinstance(data, dict):
                continue
            raw_tasks = data.get("tasks")
            if not isinstance(raw_tasks, list):
                continue
            tasks: list[dict[str, str]] = []
            for i, item in enumerate(raw_tasks):
                if not isinstance(item, dict):
                    continue
                tid = str(item.get("id") or f"t{i+1}").strip() or f"t{i+1}"
                tid = re.sub(r"[^\w\-:.@]+", "_", tid)[:96]
                tasks.append(
                    {
                        "id": tid,
                        "focus": str(item.get("focus") or "").strip(),
                        "hint": str(item.get("hint") or "").strip(),
                        "route": normalize_route(str(item.get("route") or "") or None),
                    }
                )
            if tasks:
                return {"tasks": tasks}
        except json.JSONDecodeError:
            continue

    return {
        "tasks": [
            {
                "id": "1",
                "focus": "代码安全全面审阅",
                "hint": "遵循 AGENTS.md；材料在 uploads 目录。",
                "route": "general",
            }
        ]
    }


def _scan_hint(scan_mode: str) -> str:
    mode = (scan_mode or "full").lower().strip()
    hints = {
        "full": "请全面进行安全分析、扫描建议与代码审阅。",
        "quick": "请快速审阅：优先列出最高风险的 5 条及以下，并说明未覆盖范围。",
        "deps": "侧重依赖与供应链（许可证、已知漏洞、lockfile）。",
        "secrets": "侧重密钥泄露、硬编码敏感信息与配置疏漏。",
    }
    return hints.get(mode, hints["full"])


def parse_coordinator_json(text: str, fallback: list[dict[str, str]]) -> list[dict[str, str]]:
    """Merge coordinator output with fallback tasks by id."""
    plan = parse_plan_json(text)
    by_id = {t["id"]: dict(t) for t in plan.get("tasks", [])}
    out: list[dict[str, str]] = []
    for ft in fallback:
        tid = ft["id"]
        up = by_id.get(tid, {})
        out.append(
            {
                "id": tid,
                "focus": up.get("focus") or ft.get("focus", ""),
                "hint": up.get("hint") or ft.get("hint", ""),
                "route": normalize_route(up.get("route") or ft.get("route") or "general"),
            }
        )
    return out


def planner_prompt(
    message: str,
    upload_path: str,
    scan_mode: str,
    modes_extra: str,
    min_tasks: int,
    max_tasks: int,
) -> str:
    hint = _scan_hint(scan_mode)
    msg = (message or "").strip() or "请根据上传材料做代码安全审阅。"
    extra = (modes_extra or "").strip()
    if extra:
        msg += f"\n附加 modes：{extra}"
    return (
        "你是编排器的 Planner。用户目标与上下文如下。\n\n"
        f"用户目标：{msg}\n"
        f"材料目录（workspace 相对路径）：`{upload_path}`\n"
        f"审阅侧重提示：{hint}\n\n"
        f"请将工作拆成 **至少 {min_tasks} 个、至多 {max_tasks} 个** 可并行专家子任务，覆盖不同安全视角"
        "（鉴权、注入、依赖/供应链、密钥与配置、业务逻辑等）。\n\n"
        "只输出一行合法 JSON（不要 markdown），结构严格为：\n"
        '{"tasks":[{"id":"短英文标识","focus":"一句话焦点","hint":"给专家的执行提示"},...]}\n'
        "不要包含 route 字段（由 Coordinator 分配路线）。"
    )


def coordinator_prompt(plan_tasks: list[dict[str, str]]) -> str:
    blob = json.dumps({"tasks": plan_tasks}, ensure_ascii=False)
    routes = ", ".join(sorted(_ROUTE_KEYS))
    return (
        "你是 Coordinator：在 Planner 的子任务上为每个任务分配一条审阅路线 route。\n"
        f"可选 route（必须小写）：{routes}\n"
        "含义建议：deps=依赖与供应链；secrets=密钥与敏感配置；auth=认证授权；"
        "injection=注入与危险输入；general=通用/other。\n\n"
        f"输入：{blob}\n\n"
        "只输出一行合法 JSON，结构与输入相同，但每个任务对象必须含 id, focus, hint, route 四个字段。"
        "保持 id/focus/hint 与输入一致，仅补充或校正 route。"
    )


def bound_tasks(tasks: list[dict[str, str]], min_n: int, max_n: int) -> list[dict[str, str]]:
    out = [dict(t) for t in tasks[:max_n]]
    seen = {t["id"] for t in out}
    if len(out) < min_n:
        for pad in _TASK_PAD:
            if len(out) >= min_n:
                break
            if pad["id"] not in seen:
                seen.add(pad["id"])
                out.append(dict(pad))
    while len(out) < min_n:
        u = f"extra-{len(out)+1}"
        out.append(
            {
                "id": u,
                "focus": "补充安全视角审阅",
                "hint": "查漏补缺。",
                "route": "general",
            }
        )
    return out[:max_n]


def route_hint_for_prompt(route: str) -> str:
    return {
        "deps": "侧重依赖、lockfile、供应链与许可证；可在安全前提下用 exec 跑只读审计命令。",
        "secrets": "侧重密钥与敏感信息；禁止依赖 exec 修改环境，以 read/grep 为主。",
        "auth": "侧重认证会话、授权边界、IDOR。",
        "injection": "侧重注入面与危险 API。",
        "general": "通用代码安全审阅，与其他子任务去重。",
    }.get(route, "")


def worker_prompt(
    task: dict[str, str],
    message: str,
    upload_path: str,
    scan_mode: str,
) -> str:
    hint = _scan_hint(scan_mode)
    base = (message or "").strip() or "请完成子任务所要求的审阅。"
    route = normalize_route(task.get("route"))
    rh = route_hint_for_prompt(route)
    return (
        "你是 Specialist Worker（专家子智能体）。\n"
        f"子任务 id：`{task['id']}`\n"
        f"路线 route：`{route}`（{rh}）\n"
        f"焦点：{task.get('focus') or '（未指定）'}\n"
        f"执行提示：{task.get('hint') or '无'}\n\n"
        f"用户总目标：{base}\n"
        f"材料目录：`{upload_path}`（list_dir / read_file）。\n"
        f"总体风格：{hint}\n\n"
        "输出结构化发现；聚焦本 route，避免空洞重复。"
    )


def summary_prompt(message: str, worker_outputs: dict[str, str], upload_path: str) -> str:
    blocks = []
    for tid in sorted(worker_outputs.keys()):
        raw = (worker_outputs.get(tid) or "").strip()
        body = _strip_stdout_banners_for_summary(raw)
        if _nanobot_stdout_looks_like_api_error(raw):
            body = (
                "【本子任务未产出有效审阅：模型/API 报错，可能为配额或限流。】\n"
                f"{_stderr_tail(body, 1200)}"
            )
        blocks.append(f"### Worker [{tid}]\n{body}")
    merged = "\n\n".join(blocks) if blocks else "（各子任务无输出）"
    base = (message or "").strip() or "代码安全审阅"
    return (
        "你是 Summary：合并多专家报告。\n"
        f"用户总目标：{base}\n材料路径：`{upload_path}`\n\n"
        "若仅部分 Worker 有有效内容：在终稿开头用简短列表说明「哪些子任务失败/无输出」，"
        "再仅基于有效段落做去重合并；**禁止**假设未成功 Worker 已审阅过代码。\n"
        "若全部失败：明确告知用户检查 API 配额/模型/并发，并建议降低 Worker 并发或更换供应商。\n"
        "有效内容请去重、分级（Critical/High/Medium/Low/Info）、输出完整终稿（含不确定性与验证建议）。\n\n"
        f"{merged}"
    )


def load_job_state(job_dir: Path) -> dict[str, Any] | None:
    p = job_dir / "state.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_job_state(job_dir: Path, state: dict[str, Any]) -> None:
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "state.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


_pipeline_locks: dict[str, asyncio.Lock] = {}


def _lock_for(job_id: str) -> asyncio.Lock:
    if job_id not in _pipeline_locks:
        _pipeline_locks[job_id] = asyncio.Lock()
    return _pipeline_locks[job_id]


async def prepare_pipeline_job(
    *,
    workspace: Path,
    data_dir: Path,
    files: list[UploadFile] | None,
    message: str,
    scan_mode: str,
    modes_extra: str,
    worker_concurrency_override: int | None,
    max_files: int,
    max_file_b: int,
    max_body_b: int,
    safe_filename_fn,
) -> tuple[str, str]:
    uploaded = [f for f in (files or []) if getattr(f, "filename", None)]
    if len(uploaded) > max_files:
        raise HTTPException(400, f"文件过多（最多 {max_files}）")

    uploads_root = (workspace / "uploads").resolve()
    uploads_root.mkdir(parents=True, exist_ok=True)
    job_id = uuid.uuid4().hex
    job_dir_ws = (uploads_root / job_id).resolve()
    job_dir_ws.relative_to(uploads_root)
    job_dir_ws.mkdir(parents=True, exist_ok=True)

    total = 0
    try:
        for uf in uploaded:
            if not uf.filename:
                continue
            dest_name = safe_filename_fn(uf.filename)
            dest = (job_dir_ws / dest_name).resolve()
            dest.relative_to(job_dir_ws)
            size = 0
            with dest.open("wb") as out:
                while True:
                    chunk = await uf.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    total += len(chunk)
                    if size > max_file_b:
                        raise HTTPException(400, f"单文件过大: {dest_name}")
                    if total > max_body_b:
                        raise HTTPException(400, "总上传体积过大")
                    out.write(chunk)
    except HTTPException:
        raise
    except Exception:
        shutil.rmtree(job_dir_ws, ignore_errors=True)
        raise

    upload_rel = f"uploads/{job_id}"
    pj = pipeline_job_dir(data_dir, job_id)
    conc = worker_concurrency_override
    state: dict[str, Any] = {
        "job_id": job_id,
        "status": "pending",
        "created_at": _utc_iso(),
        "message": (message or "").strip(),
        "scan_mode": (scan_mode or "full").strip(),
        "modes_extra": (modes_extra or "").strip(),
        "upload_path": upload_rel,
        "worker_concurrency": conc,
        "nodes": {"planner": {}, "coordinator": {}, "workers": {}, "summary": {}},
        "plan": None,
        "coordinated_plan": None,
        "worker_outputs": {},
        "summary_output": "",
        "metrics": {
            "worker_invocations": 0,
            "worker_successes": 0,
            "worker_failures": 0,
            "retries": 0,
        },
    }
    save_job_state(pj, state)
    return job_id, upload_rel


def _worker_retry_patch(
    *,
    route_general: dict[str, Any],
    fallback_merge: dict[str, Any],
    retry_provider: str,
    retry_model: str,
) -> dict[str, Any]:
    patch = deep_merge(dict(route_general), fallback_merge)
    ag: dict[str, Any] = {}
    if retry_provider.strip():
        ag["provider"] = retry_provider.strip()
    if retry_model.strip():
        ag["model"] = retry_model.strip()
    if ag:
        patch = deep_merge(patch, {"agents": {"defaults": ag}})
    return patch


async def stream_pipeline_events(
    *,
    job_id: str,
    data_dir: Path,
    workspace: Path,
    nanobot_bin: str,
    default_cfg_path: str,
    base_cfg: dict[str, Any],
    timeout_s: int,
    default_concurrency: int,
    min_tasks: int,
    max_tasks: int,
    worker_max_retries: int,
    enable_coordinator: bool,
    fallback_merge: dict[str, Any] | None,
    retry_provider: str = "",
    retry_model: str = "",
) -> AsyncIterator[str]:
    pj = pipeline_job_dir(data_dir, job_id)
    state = load_job_state(pj)
    if not state:
        yield sse_line("error", {"message": f"任务不存在: {job_id}", "code": "not_found"})
        return

    if state.get("status") == "completed":
        yield sse_line(
            "error",
            {"message": "任务已完成，请查看 data/pipelines 下 state.json", "code": "already_completed"},
        )
        return

    lock = _lock_for(job_id)
    if lock.locked():
        yield sse_line("error", {"message": "该任务已在执行中", "code": "duplicate_stream"})
        return

    await lock.acquire()
    env = nanobot_env()
    metrics = state.setdefault(
        "metrics",
        {"worker_invocations": 0, "worker_successes": 0, "worker_failures": 0, "retries": 0},
    )
    executor = TaskExecutor(nanobot_bin, workspace)
    wn = state.get("worker_concurrency")
    try:
        conc = int(wn) if wn is not None else int(default_concurrency)
    except (TypeError, ValueError):
        conc = int(default_concurrency)
    conc = max(1, min(conc, 16))
    sem = asyncio.Semaphore(conc)
    fb = fallback_merge if isinstance(fallback_merge, dict) else {}
    retry_prov = (retry_provider or "").strip()
    retry_mdl = (retry_model or "").strip()

    try:
        state["status"] = "running"
        state["started_at"] = _utc_iso()
        save_job_state(pj, state)

        upload_path = str(state.get("upload_path") or "")
        message = str(state.get("message") or "")
        scan_mode = str(state.get("scan_mode") or "full")
        modes_extra = str(state.get("modes_extra") or "")

        # --- Planner ---
        t0 = time.perf_counter()
        state["nodes"]["planner"] = {
            "status": "running",
            "started_at": _utc_iso(),
            "session_id": f"web:job:{job_id}:planner",
        }
        save_job_state(pj, state)
        plan_cmd = [
            nanobot_bin,
            "agent",
            "-w",
            str(workspace),
            "-c",
            default_cfg_path,
            "-s",
            f"web:job:{job_id}:planner",
            "-m",
            planner_prompt(message, upload_path, scan_mode, modes_extra, min_tasks, max_tasks),
            "--no-markdown",
        ]
        try:
            code_pl, out_pl, err_pl = await run_nanobot_to_completion(plan_cmd, env, timeout_s)
        except asyncio.TimeoutError:
            state["nodes"]["planner"].update(
                {
                    "status": "error",
                    "ended_at": _utc_iso(),
                    "duration_sec": round(time.perf_counter() - t0, 3),
                    "exit_code": None,
                    "stderr_tail": "",
                    "error": "total_timeout",
                }
            )
            state["status"] = "failed"
            save_job_state(pj, state)
            yield sse_line(
                "error",
                {"message": f"Planner 超时（{timeout_s}s）", "code": "total_timeout", "node": "planner"},
            )
            return
        except FileNotFoundError:
            state["nodes"]["planner"]["status"] = "error"
            state["nodes"]["planner"]["error"] = "nanobot_not_found"
            state["status"] = "failed"
            save_job_state(pj, state)
            yield sse_line("error", {"message": f"未找到可执行文件: {nanobot_bin}"})
            return

        pl_body = _strip_stdout_banners_for_summary(strip_ansi((out_pl or "").strip()))
        if code_pl == 0 and _nanobot_stdout_looks_like_api_error(pl_body):
            pl_err = _upstream_failure_label(pl_body)
            state["nodes"]["planner"].update(
                {
                    "status": "error",
                    "ended_at": _utc_iso(),
                    "duration_sec": round(time.perf_counter() - t0, 3),
                    "exit_code": -2,
                    "stderr_tail": _stderr_tail(err_pl),
                    "stdout_preview": _stderr_tail(out_pl, 8000),
                    "error": pl_err,
                }
            )
            state["status"] = "failed"
            save_job_state(pj, state)
            pl_msg = (
                "Planner 阶段上游 LLM 超时，无法生成任务计划。请增大扫描超时或检查网络后重试。"
                if pl_err == "upstream_llm_timeout"
                else (
                    "Planner 阶段上游返回鉴权错误（AuthenticationRequired）。请检查 Provider/API Key 是否正确，以及 custom.apiBase 是否指向对应网关。"
                    if pl_err == "upstream_authentication_required"
                    else "Planner 阶段上游返回配额/API 错误，无法生成真实任务计划。请稍后重试或更换模型。"
                )
            )
            yield sse_line("error", {"message": pl_msg, "code": pl_err, "node": "planner"})
            return

        raw_tasks = parse_plan_json(out_pl)["tasks"]
        tasks_list = bound_tasks(raw_tasks, min_tasks, max_tasks)
        state["plan"] = {"tasks": tasks_list}
        state["nodes"]["planner"].update(
            {
                "status": "ok" if code_pl == 0 else "warn",
                "ended_at": _utc_iso(),
                "duration_sec": round(time.perf_counter() - t0, 3),
                "exit_code": code_pl,
                "stderr_tail": _stderr_tail(err_pl),
                "stdout_preview": _stderr_tail(out_pl, 8000),
            }
        )
        save_job_state(pj, state)
        yield sse_line("plan", {"tasks": tasks_list, "exit_code": code_pl})

        # --- Coordinator ---
        t_coord = time.perf_counter()
        state["nodes"]["coordinator"] = {
            "status": "running" if enable_coordinator else "skipped",
            "started_at": _utc_iso(),
            "session_id": f"web:job:{job_id}:coordinator",
        }
        save_job_state(pj, state)

        if enable_coordinator:
            coord_cmd = [
                nanobot_bin,
                "agent",
                "-w",
                str(workspace),
                "-c",
                default_cfg_path,
                "-s",
                f"web:job:{job_id}:coordinator",
                "-m",
                coordinator_prompt(tasks_list),
                "--no-markdown",
            ]
            try:
                code_cd, out_cd, err_cd = await run_nanobot_to_completion(coord_cmd, env, timeout_s)
                tasks_list = parse_coordinator_json(out_cd, tasks_list)
                state["nodes"]["coordinator"].update(
                    {
                        "status": "ok" if code_cd == 0 else "warn",
                        "ended_at": _utc_iso(),
                        "duration_sec": round(time.perf_counter() - t_coord, 3),
                        "exit_code": code_cd,
                        "stderr_tail": _stderr_tail(err_cd),
                    }
                )
            except asyncio.TimeoutError:
                state["nodes"]["coordinator"].update(
                    {
                        "status": "error",
                        "ended_at": _utc_iso(),
                        "error": "total_timeout",
                    }
                )
                for t in tasks_list:
                    t["route"] = normalize_route(t.get("route"))
            except FileNotFoundError:
                state["status"] = "failed"
                save_job_state(pj, state)
                yield sse_line("error", {"message": f"未找到可执行文件: {nanobot_bin}"})
                return
        else:
            for t in tasks_list:
                t["route"] = normalize_route("general")
            state["nodes"]["coordinator"]["ended_at"] = _utc_iso()
            state["nodes"]["coordinator"]["duration_sec"] = 0.0

        state["coordinated_plan"] = {"tasks": tasks_list}
        save_job_state(pj, state)
        yield sse_line("coordinator", {"tasks": tasks_list, "enabled": enable_coordinator})

        q: asyncio.Queue = asyncio.Queue()
        worker_outputs: dict[str, str] = {}
        worker_errors: dict[str, str] = {}
        retries_cap = max(0, min(int(worker_max_retries), 3))

        async def one_worker(task_def: dict[str, str]) -> None:
            tid = str(task_def.get("id") or "task")
            route = normalize_route(task_def.get("route"))
            slug = _runtime_slug(tid)
            node_path = state["nodes"]["workers"].setdefault(
                tid,
                {
                    "status": "pending",
                    "session_id": f"web:job:{job_id}:w:{tid}",
                    "route": route,
                },
            )
            node_path["route"] = route

            async with sem:
                t_w0 = time.perf_counter()
                node_path["status"] = "running"
                node_path["started_at"] = _utc_iso()
                save_job_state(pj, state)
                await q.put(
                    (
                        "worker_start",
                        {"task_id": tid, "focus": task_def.get("focus", ""), "route": route},
                    )
                )

                primary = pj / f"runtime_worker_{slug}.json"
                retry_rt = pj / f"runtime_worker_{slug}_retry.json"
                route_patch = ROUTE_PROFILES.get(route, ROUTE_PROFILES["general"])
                executor.build_worker_runtime(primary, base_cfg, route_patch)
                retry_patch = _worker_retry_patch(
                    route_general=ROUTE_PROFILES["general"],
                    fallback_merge=fb,
                    retry_provider=retry_prov,
                    retry_model=retry_mdl,
                )
                executor.build_worker_runtime(retry_rt, base_cfg, retry_patch)

                policy = WorkerPolicy(timeout_s=timeout_s)
                wprompt = worker_prompt(task_def, message, upload_path, scan_mode)
                exit_c = -1
                full_out = ""
                err_full = ""
                attempts_used = 0

                for attempt in range(retries_cap + 1):
                    attempts_used += 1
                    metrics["worker_invocations"] += 1
                    cfg_p = primary if attempt == 0 else retry_rt
                    sid = f"web:job:{job_id}:w:{tid}" if attempt == 0 else f"web:job:{job_id}:w:{tid}:retry"
                    if attempt > 0:
                        metrics["retries"] += 1
                        node_path["retries"] = node_path.get("retries", 0) + 1

                    async def _emit_chunk(text: str) -> None:
                        await q.put(("worker_chunk", {"task_id": tid, "text": text}))

                    try:
                        exit_c, full_out, err_full = await executor.run_worker_streaming(
                            cfg_path=cfg_p,
                            session_id=sid,
                            prompt=wprompt,
                            policy=policy,
                            on_chunk=_emit_chunk,
                        )
                        # Nanobot 常在 LLM 报错时仍 exit 0 —— 应用 stdout 启发式识别假成功
                        if exit_c == 0 and _nanobot_stdout_looks_like_api_error(full_out):
                            exit_c = -2
                    except FileNotFoundError:
                        metrics["worker_failures"] += 1
                        node_path.update(
                            {
                                "status": "error",
                                "ended_at": _utc_iso(),
                                "duration_sec": round(time.perf_counter() - t_w0, 3),
                                "exit_code": None,
                                "error": "nanobot_not_found",
                            }
                        )
                        worker_errors[tid] = "nanobot_not_found"
                        await q.put(
                            (
                                "worker_done",
                                {
                                    "task_id": tid,
                                    "exit_code": None,
                                    "error": "nanobot_not_found",
                                    "route": route,
                                    "attempts": attempts_used,
                                },
                            )
                        )
                        save_job_state(pj, state)
                        return

                    if exit_c == 0:
                        break
                    if attempt >= retries_cap:
                        break

                if exit_c == 0:
                    worker_outputs[tid] = _strip_stdout_banners_for_summary(full_out)
                    metrics["worker_successes"] += 1
                    np_ok = {
                        "status": "ok",
                        "ended_at": _utc_iso(),
                        "duration_sec": round(time.perf_counter() - t_w0, 3),
                        "exit_code": exit_c,
                        "stderr_tail": _stderr_tail(err_full),
                        "attempts": attempts_used,
                        "used_retry_runtime": attempts_used > 1,
                    }
                    if attempts_used > 1 and (retry_prov or retry_mdl):
                        np_ok["retry_fallback"] = f"provider={retry_prov or '(base)'} model={retry_mdl or '(base)'}"
                    node_path.update(np_ok)
                    await q.put(
                        (
                            "worker_done",
                            {
                                "task_id": tid,
                                "exit_code": exit_c,
                                "route": route,
                                "attempts": attempts_used,
                                "stderr_tail": _stderr_tail(err_full, 1500),
                            },
                        )
                    )
                else:
                    metrics["worker_failures"] += 1
                    if exit_c == -2:
                        label = _upstream_failure_label(full_out)
                    elif exit_c == -1:
                        label = "total_timeout"
                    else:
                        label = f"exit_{exit_c}"
                    worker_errors[tid] = label
                    np_err = {
                        "status": "error",
                        "ended_at": _utc_iso(),
                        "duration_sec": round(time.perf_counter() - t_w0, 3),
                        "exit_code": exit_c,
                        "stderr_tail": _stderr_tail(err_full),
                        "error": label,
                        "attempts": attempts_used,
                        "used_retry_runtime": attempts_used > 1,
                    }
                    if attempts_used > 1 and (retry_prov or retry_mdl):
                        np_err["retry_fallback"] = f"provider={retry_prov or '(base)'} model={retry_mdl or '(base)'}"
                    node_path.update(np_err)
                    await q.put(
                        (
                            "worker_done",
                            {
                                "task_id": tid,
                                "exit_code": exit_c,
                                "error": label,
                                "route": route,
                                "attempts": attempts_used,
                            },
                        )
                    )
                save_job_state(pj, state)

        # 勿使用 create_task(gather(...))：部分环境下 gather 会体现为 Future，create_task 只接受 coroutine。
        worker_tasks = [asyncio.create_task(one_worker(t)) for t in tasks_list]
        n = len(tasks_list)
        got = 0
        while got < n:
            item = await q.get()
            if item[0] == "worker_start":
                yield sse_line("worker_start", item[1])
            elif item[0] == "worker_chunk":
                yield sse_line("worker_chunk", item[1])
            elif item[0] == "worker_done":
                got += 1
                yield sse_line("worker_done", item[1])
        await asyncio.gather(*worker_tasks)

        for t in tasks_list:
            tid = str(t.get("id") or "")
            if tid and tid not in worker_outputs:
                err = worker_errors.get(tid, "").strip()
                worker_outputs[tid] = f"【子任务未成功完成】。{err}" if err else "【子任务未成功完成】"

        state["worker_outputs"] = worker_outputs
        save_job_state(pj, state)

        # 无一成功子任务时跳过 Summary，避免在明确已无有效输入时再打一枪 API
        if int(metrics.get("worker_successes") or 0) == 0:
            t_skip = time.perf_counter()
            skip_msg = (
                "【流水线未完成合并】所有 Specialist 子任务均未拿到有效审阅结果"
                "（常见原因：Aihubmix 免费档并发/RPM/额度限制，或网络超时）。"
                "本次已跳过 Summary 的额外模型调用。\n\n"
                "建议：① Worker 并发设为 1 并间隔 1～2 分钟再跑；② 更换或充值上游模型；"
                "③ 在 data/pipelines/<jobId>/state.json 查看各 worker 的 error 与 stderr_tail。\n"
            )
            state["nodes"]["summary"] = {
                "status": "skipped",
                "started_at": _utc_iso(),
                "ended_at": _utc_iso(),
                "duration_sec": round(time.perf_counter() - t_skip, 3),
                "exit_code": -3,
                "error": "no_worker_success",
                "session_id": f"web:job:{job_id}:summary",
            }
            state["summary_output"] = skip_msg
            state["status"] = "failed"
            state["completed_at"] = _utc_iso()
            save_job_state(pj, state)
            yield sse_line(
                "error",
                {
                    "message": "全部子任务失败，已跳过 Summary（未再请求合并模型）。",
                    "code": "all_workers_failed",
                    "node": "summary",
                },
            )
            yield sse_line(
                "done",
                {
                    "job_id": job_id,
                    "state_path": str(pj / "state.json"),
                    "summary_exit_code": -3,
                    "metrics": metrics,
                    "all_workers_failed": True,
                    "summary_preview": skip_msg[:4000],
                },
            )
            return

        # --- Summary（独立一轮 LLM，易受 RPM/额度影响；与 Worker 并发无关）---
        t_s = time.perf_counter()
        state["nodes"]["summary"] = {
            "status": "running",
            "started_at": _utc_iso(),
            "session_id": f"web:job:{job_id}:summary",
        }
        save_job_state(pj, state)
        scmd = [
            nanobot_bin,
            "agent",
            "-w",
            str(workspace),
            "-c",
            default_cfg_path,
            "-s",
            f"web:job:{job_id}:summary",
            "-m",
            summary_prompt(message, worker_outputs, upload_path),
            "--no-markdown",
        ]
        metrics.setdefault("summary_retries", 0)
        _summary_backoffs = (0.0, 6.0, 14.0)
        stext = ""
        ex = -1
        err_sum = ""

        for s_attempt in range(len(_summary_backoffs)):
            delay = _summary_backoffs[s_attempt]
            if delay > 0:
                await asyncio.sleep(delay)
            if s_attempt > 0:
                metrics["summary_retries"] += 1
                state["nodes"]["summary"]["retries"] = metrics["summary_retries"]
                save_job_state(pj, state)

            summary_parts: list[str] = []
            try:
                proc_s = await asyncio.create_subprocess_exec(
                    *scmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env,
                )
            except FileNotFoundError:
                state["nodes"]["summary"].update({"status": "error", "error": "nanobot_not_found"})
                state["status"] = "failed"
                save_job_state(pj, state)
                yield sse_line("error", {"message": f"未找到可执行文件: {nanobot_bin}", "node": "summary"})
                return

            err_task = asyncio.create_task(proc_s.stderr.read())
            loop = asyncio.get_running_loop()
            dl = loop.time() + timeout_s
            try:
                async for chunk in iter_stdout_chunks(proc_s, dl):
                    summary_parts.append(chunk)
                    yield sse_line("summary_chunk", {"text": chunk})
            except asyncio.TimeoutError:
                proc_s.kill()
                await proc_s.wait()
                if not err_task.done():
                    err_task.cancel()
                    try:
                        await err_task
                    except asyncio.CancelledError:
                        pass
                state["nodes"]["summary"].update(
                    {
                        "status": "error",
                        "ended_at": _utc_iso(),
                        "duration_sec": round(time.perf_counter() - t_s, 3),
                        "error": "total_timeout",
                    }
                )
                state["status"] = "failed"
                state["summary_output"] = "".join(summary_parts)
                save_job_state(pj, state)
                yield sse_line(
                    "error",
                    {"message": f"Summary 超时（{timeout_s}s）", "code": "total_timeout", "node": "summary"},
                )
                return

            await proc_s.wait()
            err_sb = await err_task
            err_sum = strip_ansi(err_sb.decode("utf-8", errors="replace"))
            ex = proc_s.returncode if proc_s.returncode is not None else -1
            stext = _strip_stdout_banners_for_summary("".join(summary_parts))
            state["summary_output"] = stext

            api_bad = ex == 0 and _nanobot_stdout_looks_like_api_error(stext)
            if ex == 0 and not api_bad:
                break
            if api_bad and s_attempt < len(_summary_backoffs) - 1:
                continue
            break

        if ex == 0 and _nanobot_stdout_looks_like_api_error(stext):
            ex = -2
            sum_err = _upstream_failure_label(stext)
            state["nodes"]["summary"].update(
                {
                    "status": "error",
                    "ended_at": _utc_iso(),
                    "duration_sec": round(time.perf_counter() - t_s, 3),
                    "exit_code": ex,
                    "stderr_tail": _stderr_tail(err_sum),
                    "error": sum_err,
                }
            )
            state["status"] = "failed"
            save_job_state(pj, state)
            if sum_err == "upstream_llm_timeout":
                sum_msg = (
                    "Summary 上游 LLM 请求超时（nanobot 仍可能 exit 0）。"
                    "五个子任务已成功时可只看各子任务输出；或在设置中增大「扫描超时」后仅重跑合并。"
                )
                sum_code = "upstream_llm_timeout"
            elif sum_err == "upstream_authentication_required":
                sum_msg = (
                    "Summary 上游鉴权失败（AuthenticationRequired）。"
                    "请检查 Provider/API Key 是否对应该网关，以及自定义的 custom.apiBase 是否正确。"
                )
                sum_code = "upstream_authentication_required"
            else:
                sum_msg = (
                    "Summary 收到上游配额/API 错误（常见于免费档 RPM/并发）。"
                    "Worker 可能已成功，可查看各子任务输出；或稍后重试 Summary。"
                )
                sum_code = "upstream_llm_or_quota"
            yield sse_line("error", {"message": sum_msg, "code": sum_code, "node": "summary"})
            return

        state["nodes"]["summary"].update(
            {
                "status": "ok" if ex == 0 else "warn",
                "ended_at": _utc_iso(),
                "duration_sec": round(time.perf_counter() - t_s, 3),
                "exit_code": ex,
                "stderr_tail": _stderr_tail(err_sum),
            }
        )
        state["status"] = "completed"
        state["completed_at"] = _utc_iso()
        save_job_state(pj, state)
        yield sse_line(
            "done",
            {
                "job_id": job_id,
                "state_path": str(pj / "state.json"),
                "summary_exit_code": ex,
                "metrics": metrics,
            },
        )
    except Exception as ex:  # noqa: BLE001
        st = load_job_state(pj)
        if st is None:
            st = {"job_id": job_id, "nodes": {}}
        st["status"] = "failed"
        st.setdefault("nodes", {})
        st["nodes"]["_fatal"] = {"error": str(ex)[:2000]}
        save_job_state(pj, st)
        yield sse_line("error", {"message": str(ex)[:2000], "code": "internal"})
    finally:
        lock.release()
