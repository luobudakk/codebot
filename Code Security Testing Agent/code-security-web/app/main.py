"""Code security Web UI: settings + multi-agent pipeline (Planner–Coordinator–Specialists–Summary)."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app.config_util import deep_merge
from app.pipeline import pipeline_job_dir, prepare_pipeline_job, stream_pipeline_events

_BASE = Path(__file__).resolve().parent.parent
_DATA = _BASE / "data"
_SETTINGS_PATH = _DATA / "ui_settings.json"
_RUNTIME_CONFIG_PATH = _DATA / "nanobot_runtime.json"
_DEFAULT_WS = (_BASE.parent / "code-security-agent").resolve()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def default_settings() -> dict[str, Any]:
    return {
        "workspace": str(_DEFAULT_WS),
        "nanobotBin": os.environ.get("NANOBOT_BIN") or shutil.which("nanobot") or "nanobot",
        "baseConfigPath": (os.environ.get("NANOBOT_CONFIG") or "").strip(),
        "useOnlyBaseConfig": False,
        "provider": "auto",
        "model": "anthropic/claude-sonnet-4-20250514",
        "maxToolIterations": 40,
        "apiKeys": {},
        "customApiBase": "",
        "toolsRestrictToWorkspace": True,
        "execEnable": True,
        "execTimeout": 120,
        "scanTimeoutSec": _env_int("CODE_SECURITY_SCAN_TIMEOUT_SEC", 1800),
        "pipelineWorkerConcurrency": _env_int("CODE_SECURITY_PIPELINE_WORKERS", 3),
        "pipelineMinTasks": _env_int("CODE_SECURITY_PIPELINE_MIN_TASKS", 5),
        "pipelineMaxTasks": _env_int("CODE_SECURITY_PIPELINE_MAX_TASKS", 12),
        "pipelineWorkerRetries": _env_int("CODE_SECURITY_PIPELINE_RETRIES", 1),
        "pipelineEnableCoordinator": True,
        "pipelineFallbackMergeJson": "",
        "pipelineRetryProvider": "",
        "pipelineRetryModel": "",
        "maxFiles": _env_int("CODE_SECURITY_MAX_FILES", 40),
        "maxFileMb": _env_int("CODE_SECURITY_MAX_FILE_MB", 8),
        "maxBodyMb": _env_int("CODE_SECURITY_MAX_BODY_MB", 80),
        "mergeJson": "",
        "temperature": 0.1,
        "timezone": "UTC",
    }


def load_settings() -> dict[str, Any]:
    data = default_settings()
    if _SETTINGS_PATH.is_file():
        try:
            raw = json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data.update(raw)
        except (json.JSONDecodeError, OSError):
            pass
    return data


def save_settings(data: dict[str, Any]) -> None:
    _DATA.mkdir(parents=True, exist_ok=True)
    prev = {}
    if _SETTINGS_PATH.is_file():
        try:
            prev = json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    merged = {**default_settings(), **prev}
    for key, val in data.items():
        if key == "apiKeys":
            if isinstance(val, dict):
                merged["apiKeys"] = dict(val)
        else:
            merged[key] = val
    _SETTINGS_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")


def _nanobot_skeleton_from_ui(s: dict[str, Any]) -> dict[str, Any]:
    cfg: dict[str, Any] = {
        "agents": {
            "defaults": {
                "workspace": s["workspace"],
                "model": s["model"],
                "provider": s["provider"],
                "maxToolIterations": int(s.get("maxToolIterations") or 40),
                "temperature": float(s.get("temperature") or 0.1),
                "timezone": (s.get("timezone") or "UTC").strip() or "UTC",
            }
        },
        "tools": {
            "restrictToWorkspace": bool(s.get("toolsRestrictToWorkspace", True)),
            "exec": {
                "enable": bool(s.get("execEnable", True)),
                "timeout": int(s.get("execTimeout") or 120),
            },
        },
        "providers": {},
    }
    api_keys = s.get("apiKeys") or {}
    if isinstance(api_keys, dict):
        for name, key in api_keys.items():
            if isinstance(key, str) and key.strip():
                cfg["providers"].setdefault(str(name), {})["apiKey"] = key.strip()
    api_base = (s.get("customApiBase") or "").strip()
    if api_base:
        cfg["providers"].setdefault("custom", {})["apiBase"] = api_base
    return cfg


def build_runtime_nanobot_config(s: dict[str, Any]) -> dict[str, Any]:
    bpath = (s.get("baseConfigPath") or "").strip()
    base: dict[str, Any] = {}
    if bpath:
        p = Path(bpath).expanduser()
        if p.is_file():
            base = json.loads(p.read_text(encoding="utf-8"))
        elif s.get("useOnlyBaseConfig"):
            raise ValueError(f"基础配置文件不存在: {p}")

    if s.get("useOnlyBaseConfig"):
        if not bpath:
            raise ValueError("仅使用基础配置时，请填写基础配置文件路径")
        p = Path(bpath).expanduser()
        if not p.is_file():
            raise ValueError(f"基础配置文件不存在: {p}")
        merged = json.loads(p.read_text(encoding="utf-8"))
    else:
        merged = deep_merge(base, _nanobot_skeleton_from_ui(s))

    extra = (s.get("mergeJson") or "").strip()
    if extra:
        patch = json.loads(extra)
        if not isinstance(patch, dict):
            raise ValueError("合并 JSON 必须是对象")
        merged = deep_merge(merged, patch)
    return merged


def write_runtime_config(cfg: dict[str, Any]) -> None:
    _DATA.mkdir(parents=True, exist_ok=True)
    _RUNTIME_CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def public_settings_view(s: dict[str, Any]) -> dict[str, Any]:
    keys = s.get("apiKeys") or {}
    configured = [k for k, v in keys.items() if isinstance(v, str) and v.strip()]
    out = {k: v for k, v in s.items() if k != "apiKeys"}
    out["providersWithKeys"] = sorted(configured)
    return out


def safe_filename(name: str) -> str:
    base = Path(name).name
    if not base or base in (".", "..") or ".." in base:
        return "unnamed"
    base = base.replace("\x00", "").strip()
    if not base:
        return "unnamed"
    return base[:180]


def _valid_pipeline_job_id(job_id: str) -> bool:
    if not job_id or len(job_id) != 32:
        return False
    return all(c in "0123456789abcdef" for c in job_id.lower())


app = FastAPI(title="Code Security Web", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CODE_SECURITY_CORS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_STATIC = _BASE / "static"
if _STATIC.is_dir():
    app.mount("/static", StaticFiles(directory=str(_STATIC)), name="static")


@app.get("/", response_class=HTMLResponse)
async def root_index():
    index = _STATIC / "index.html"
    if index.is_file():
        return HTMLResponse(index.read_text(encoding="utf-8"))
    return HTMLResponse("<p>Missing static/index.html</p>", status_code=500)


@app.get("/api/settings")
async def api_get_settings():
    return public_settings_view(load_settings())


@app.put("/api/settings")
async def api_put_settings(body: dict[str, Any] = Body(...)):
    if not isinstance(body, dict):
        raise HTTPException(400, "Body must be a JSON object")
    cur = load_settings()
    skip = {"apiKeys", "apiKeysRemove"}
    patch = {k: v for k, v in body.items() if k not in skip}
    merged_keys = dict(cur.get("apiKeys") or {})
    rm = body.get("apiKeysRemove")
    if isinstance(rm, list):
        for name in rm:
            merged_keys.pop(str(name), None)
    if "apiKeys" in body and isinstance(body["apiKeys"], dict):
        for name, val in body["apiKeys"].items():
            if isinstance(val, str) and val.strip():
                merged_keys[str(name)] = val.strip()
    if "apiKeys" in body or isinstance(rm, list):
        patch["apiKeys"] = merged_keys
    save_settings(patch)
    return public_settings_view(load_settings())


@app.post("/api/settings/clear-keys")
async def api_clear_keys():
    save_settings({"apiKeys": {}})
    return public_settings_view(load_settings())


@app.get("/api/health")
async def health():
    s = load_settings()
    return {
        "ok": True,
        "workspace": s.get("workspace"),
        "nanobot": s.get("nanobotBin"),
        "baseConfig": (s.get("baseConfigPath") or None),
        "providersConfigured": public_settings_view(s)["providersWithKeys"],
    }


@app.post("/api/pipeline/start")
async def pipeline_start(
    message: str = Form(""),
    scan_mode: str = Form("full"),
    modes: str = Form(""),
    pipeline_worker_concurrency: str = Form(""),
    files: list[UploadFile] | None = File(None),
):
    s = load_settings()
    workspace = Path(str(s.get("workspace") or _DEFAULT_WS)).expanduser().resolve()
    max_files = int(s.get("maxFiles") or 40)
    max_file_b = int(s.get("maxFileMb") or 8) * 1024 * 1024
    max_body_b = int(s.get("maxBodyMb") or 80) * 1024 * 1024

    if not workspace.is_dir():
        raise HTTPException(500, f"Workspace 不存在: {workspace}")

    msg = (message or "").strip()
    uploaded = [f for f in (files or []) if getattr(f, "filename", None)]
    if not msg and not uploaded:
        raise HTTPException(400, "请填写流水线目标说明或上传至少一个文件")

    conc_override: int | None = None
    if (pipeline_worker_concurrency or "").strip():
        try:
            conc_override = int(pipeline_worker_concurrency.strip())
        except ValueError:
            raise HTTPException(400, "pipeline_worker_concurrency 必须是整数")

    job_id, upload_path = await prepare_pipeline_job(
        workspace=workspace,
        data_dir=_DATA,
        files=files,
        message=message,
        scan_mode=scan_mode,
        modes_extra=modes,
        worker_concurrency_override=conc_override,
        max_files=max_files,
        max_file_b=max_file_b,
        max_body_b=max_body_b,
        safe_filename_fn=safe_filename,
    )
    return {"job_id": job_id, "upload_path": upload_path}


@app.get("/api/pipeline/{job_id}/stream")
async def pipeline_stream(job_id: str):
    if not _valid_pipeline_job_id(job_id):
        raise HTTPException(400, "无效的 job_id")

    s = load_settings()
    workspace = Path(str(s.get("workspace") or _DEFAULT_WS)).expanduser().resolve()
    if not workspace.is_dir():
        raise HTTPException(500, f"Workspace 不存在: {workspace}")

    if not (pipeline_job_dir(_DATA, job_id) / "state.json").is_file():
        raise HTTPException(404, "任务不存在")

    try:
        merged_cfg = build_runtime_nanobot_config(s)
        merged_cfg.setdefault("agents", {}).setdefault("defaults", {})["workspace"] = str(workspace)
        write_runtime_config(merged_cfg)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"合并 JSON 无效: {e}")

    default_cfg_path = str(_RUNTIME_CONFIG_PATH.resolve())
    timeout_s = int(s.get("scanTimeoutSec") or 1800)
    nanobot_bin = str(s.get("nanobotBin") or "nanobot")
    try:
        default_conc = int(s.get("pipelineWorkerConcurrency") or 3)
    except (TypeError, ValueError):
        default_conc = 3
    try:
        min_tasks = max(1, int(s.get("pipelineMinTasks") or 5))
    except (TypeError, ValueError):
        min_tasks = 5
    try:
        max_tasks = max(min_tasks, int(s.get("pipelineMaxTasks") or 12))
    except (TypeError, ValueError):
        max_tasks = 12
    try:
        worker_retries = max(0, int(s.get("pipelineWorkerRetries") or 1))
    except (TypeError, ValueError):
        worker_retries = 1
    enable_coord = bool(s.get("pipelineEnableCoordinator", True))
    fb_raw = (s.get("pipelineFallbackMergeJson") or "").strip()
    fallback_merge: dict[str, Any] | None = None
    if fb_raw:
        try:
            p = json.loads(fb_raw)
            fallback_merge = p if isinstance(p, dict) else None
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"流水线重试合并 JSON 无效: {e}")

    retry_provider = str(s.get("pipelineRetryProvider") or "").strip()
    retry_model = str(s.get("pipelineRetryModel") or "").strip()

    async def event_gen():
        async for line in stream_pipeline_events(
            job_id=job_id,
            data_dir=_DATA,
            workspace=workspace,
            nanobot_bin=nanobot_bin,
            default_cfg_path=default_cfg_path,
            base_cfg=merged_cfg,
            timeout_s=timeout_s,
            default_concurrency=default_conc,
            min_tasks=min_tasks,
            max_tasks=max_tasks,
            worker_max_retries=worker_retries,
            enable_coordinator=enable_coord,
            fallback_merge=fallback_merge,
            retry_provider=retry_provider,
            retry_model=retry_model,
        ):
            yield line

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
