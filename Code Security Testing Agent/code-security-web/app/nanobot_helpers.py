"""Subprocess + streaming helpers for nanobot agent runs."""

from __future__ import annotations

import asyncio
import os
import re
from typing import Any, AsyncIterator

ANSI_RE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def strip_ansi(text: str) -> str:
    return ANSI_RE.sub("", text)


def nanobot_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env["NO_COLOR"] = "1"
    return env


async def iter_stdout_chunks(
    proc: asyncio.subprocess.Process,
    deadline: float,
    *,
    read_idle_s: float = 1.0,
) -> AsyncIterator[str]:
    loop = asyncio.get_running_loop()
    while True:
        now = loop.time()
        if now >= deadline:
            raise asyncio.TimeoutError()
        remain = deadline - now
        wait_chunk = min(read_idle_s, remain)
        try:
            chunk = await asyncio.wait_for(proc.stdout.read(1024), timeout=wait_chunk)
        except asyncio.TimeoutError:
            continue
        if not chunk:
            break
        text = strip_ansi(chunk.decode("utf-8", errors="replace"))
        if text:
            yield text


async def run_nanobot_to_completion(
    cmd: list[str],
    env: dict[str, str],
    timeout_s: int,
) -> tuple[int, str, str]:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_s
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    stderr_task = asyncio.create_task(proc.stderr.read())
    parts: list[str] = []
    try:
        async for chunk in iter_stdout_chunks(proc, deadline):
            parts.append(chunk)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        if not stderr_task.done():
            stderr_task.cancel()
            try:
                await stderr_task
            except asyncio.CancelledError:
                pass
        raise
    await proc.wait()
    stderr_bytes = await stderr_task
    err = strip_ansi(stderr_bytes.decode("utf-8", errors="replace"))
    return proc.returncode, "".join(parts), err


def agent_cmd(
    nanobot_bin: str,
    workspace: str,
    cfg_path: str,
    session_id: str,
    prompt: str,
) -> list[str]:
    return [
        nanobot_bin,
        "agent",
        "-w",
        workspace,
        "-c",
        cfg_path,
        "-s",
        session_id,
        "-m",
        prompt,
        "--no-markdown",
    ]
