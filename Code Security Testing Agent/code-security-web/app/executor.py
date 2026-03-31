"""
TaskExecutor: execution layer for nanobot agent (subprocess + stream).
Policy (timeout) and retries (multi cfg) are orchestrated in pipeline; Semaphore = scheduler.
"""

from __future__ import annotations

import asyncio
import copy
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Coroutine

from app.config_util import deep_merge
from app.nanobot_helpers import agent_cmd, iter_stdout_chunks, nanobot_env, strip_ansi


@dataclass
class WorkerPolicy:
    """Per-invocation limits (strategy hints; enforced in run_worker_streaming)."""

    timeout_s: int
    read_idle_s: float = 1.0


class TaskExecutor:
    def __init__(self, nanobot_bin: str, workspace: Path) -> None:
        self.nanobot_bin = nanobot_bin
        self.workspace = workspace
        self.env = nanobot_env()

    def _write_runtime(self, path: Path, cfg: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

    def build_worker_runtime(
        self,
        path: Path,
        base_cfg: dict[str, Any],
        route_patch: dict[str, Any],
    ) -> Path:
        cfg = deep_merge(copy.deepcopy(base_cfg), route_patch)
        self._write_runtime(path, cfg)
        return path

    async def run_worker_streaming(
        self,
        *,
        cfg_path: Path,
        session_id: str,
        prompt: str,
        policy: WorkerPolicy,
        on_chunk: Callable[[str], Coroutine[Any, Any, None]],
    ) -> tuple[int, str, str]:
        cmd = agent_cmd(
            self.nanobot_bin,
            str(self.workspace),
            str(cfg_path.resolve()),
            session_id,
            prompt,
        )
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=self.env,
        )
        stderr_task = asyncio.create_task(proc.stderr.read())
        loop = asyncio.get_running_loop()
        deadline = loop.time() + policy.timeout_s
        parts: list[str] = []
        try:
            async for chunk in iter_stdout_chunks(proc, deadline, read_idle_s=policy.read_idle_s):
                parts.append(chunk)
                await on_chunk(chunk)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            if not stderr_task.done():
                stderr_task.cancel()
                try:
                    await stderr_task
                except asyncio.CancelledError:
                    pass
            return -1, "".join(parts), ""
        await proc.wait()
        err_b = await stderr_task
        err = strip_ansi(err_b.decode("utf-8", errors="replace"))
        exit_c = proc.returncode if proc.returncode is not None else -1
        return exit_c, "".join(parts), err
