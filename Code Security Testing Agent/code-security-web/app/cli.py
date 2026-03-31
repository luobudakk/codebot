"""Terminal client: same pipeline as Web UI (HTTP + SSE). Run from repo root: python -m app.cli run -h"""

from __future__ import annotations

import json
import os
from contextlib import ExitStack
from pathlib import Path
from typing import Annotated, Optional

import httpx
import typer
from rich.console import Console
from rich.panel import Panel

app = typer.Typer(
    help="调用本机 code-security-web 的流水线 API（多端：Web + CLI）。",
    no_args_is_help=True,
)
console = Console()


def _parse_sse_block(block: str) -> tuple[str, dict]:
    event = "message"
    data_lines: list[str] = []
    for line in block.split("\n"):
        line = line.rstrip("\r")
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
    raw = "\n".join(data_lines)
    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        data = {"_raw": raw}
    return event, data


@app.command("run")
def pipeline_run(
    message: Annotated[str, typer.Option("--message", "-m", help="审阅目标")] = "",
    scan_mode: Annotated[str, typer.Option("--scan-mode", help="full|quick|deps|secrets")] = "full",
    modes: Annotated[str, typer.Option("--modes", help="附加 modes")] = "",
    concurrency: Annotated[
        Optional[int],
        typer.Option("--concurrency", "-j", help="本次 Worker 并发（覆盖设置）"),
    ] = None,
    file: Annotated[
        list[Path],
        typer.Option(
            "--file",
            "-f",
            exists=True,
            dir_okay=False,
            readable=True,
            help="上传文件，可重复 -f",
        ),
    ] = [],
    base_url: Annotated[
        Optional[str],
        typer.Option(
            "--url",
            help="API 根地址；默认同环境变量 CODE_SECURITY_API_URL 或 http://127.0.0.1:8787",
        ),
    ] = None,
    quiet: Annotated[
        bool,
        typer.Option("--quiet", "-q", help="仅打印 summary 流与 done/error"),
    ] = False,
) -> None:
    """POST /api/pipeline/start，再 GET /api/pipeline/{job_id}/stream 直到结束。"""
    base = (
        base_url
        or os.environ.get("CODE_SECURITY_API_URL")
        or "http://127.0.0.1:8787"
    ).rstrip("/")

    if not message.strip() and not file:
        console.print("[red]需要 -m 审阅目标 或至少一个 -f 文件[/red]")
        raise typer.Exit(1)

    data: dict[str, str] = {
        "message": message,
        "scan_mode": scan_mode,
        "modes": modes,
    }
    if concurrency is not None:
        data["pipeline_worker_concurrency"] = str(concurrency)

    try:
        with httpx.Client(timeout=httpx.Timeout(300.0, connect=20.0)) as client:
            with ExitStack() as stack:
                file_fields: list[tuple[str, tuple[str, object]]] = []
                for p in file:
                    fh = stack.enter_context(p.open("rb"))
                    file_fields.append(("files", (p.name, fh)))
                try:
                    r0 = client.post(f"{base}/api/pipeline/start", data=data, files=file_fields or None)
                except httpx.RequestError as e:
                    console.print(f"[red]连接失败:[/red] {e}")
                    raise typer.Exit(2) from e

            if r0.status_code != 200:
                console.print(f"[red]HTTP {r0.status_code}[/red] {r0.text}")
                raise typer.Exit(3)

            payload = r0.json()
            job_id = payload.get("job_id", "")
            up = payload.get("upload_path", "")
            console.print(
                Panel.fit(f"[bold]job_id[/bold] {job_id}\n[bold]upload[/bold] {up}", title="任务已创建")
            )

            buf = b""
            with client.stream(
                "GET",
                f"{base}/api/pipeline/{job_id}/stream",
                timeout=httpx.Timeout(None, connect=60.0),
            ) as stream:
                if stream.status_code != 200:
                    body = stream.read().decode("utf-8", errors="replace")
                    console.print(f"[red]流 HTTP {stream.status_code}[/red] {body}")
                    raise typer.Exit(4)
                for chunk in stream.iter_bytes(chunk_size=8192):
                    buf += chunk
                    while b"\n\n" in buf:
                        raw_block, buf = buf.split(b"\n\n", 1)
                        block = raw_block.decode("utf-8", errors="replace")
                        if not block.strip():
                            continue
                        evt, evd = _parse_sse_block(block)
                        if quiet and evt not in ("summary_chunk", "done", "error"):
                            continue
                        if evt == "plan":
                            console.print(
                                f"[cyan]plan[/cyan] tasks={len(evd.get('tasks', []))} "
                                f"exit={evd.get('exit_code')}"
                            )
                        elif evt == "coordinator":
                            console.print(f"[cyan]coordinator[/cyan] enabled={evd.get('enabled')}")
                        elif evt == "worker_start":
                            console.print(
                                f"  [yellow]▸[/yellow] {evd.get('task_id')} "
                                f"[dim]route={evd.get('route', '')}[/dim]"
                            )
                        elif evt == "worker_chunk":
                            if not quiet:
                                console.print(evd.get("text", ""), end="", markup=False, highlight=False)
                        elif evt == "worker_done":
                            ok = evd.get("exit_code") == 0 and not evd.get("error")
                            tag = "[green]OK[/green]" if ok else "[red]FAIL[/red]"
                            console.print(
                                f"  {tag} [dim]worker_done[/dim] {evd.get('task_id')} "
                                f"exit={evd.get('exit_code')} attempts={evd.get('attempts', '')}"
                            )
                        elif evt == "summary_chunk":
                            console.print(evd.get("text", ""), end="", markup=False, highlight=False)
                        elif evt == "done":
                            console.print(
                                f"\n[green]done[/green] summary_exit={evd.get('summary_exit_code')} "
                                f"\n{evd.get('state_path', '')}"
                            )
                            m = evd.get("metrics")
                            if isinstance(m, dict):
                                console.print(
                                    "[dim]metrics[/dim] "
                                    f"invocations={m.get('worker_invocations')} "
                                    f"successes={m.get('worker_successes')} "
                                    f"failures={m.get('worker_failures')} "
                                    f"retries={m.get('retries')}"
                                )
                        elif evt == "error":
                            console.print(f"[red]error[/red] {evd.get('message', evd)}")
                            raise typer.Exit(5)
    except httpx.RequestError as e:
        console.print(f"[red]流中断:[/red] {e}")
        raise typer.Exit(6) from e


@app.command("health")
def health_cmd(
    base_url: Annotated[
        Optional[str],
        typer.Option("--url", envvar="CODE_SECURITY_API_URL"),
    ] = None,
) -> None:
    """GET /api/health"""
    base = (
        base_url
        or os.environ.get("CODE_SECURITY_API_URL")
        or "http://127.0.0.1:8787"
    ).rstrip("/")
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(f"{base}/api/health")
    except httpx.RequestError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e
    try:
        console.print(json.dumps(r.json(), ensure_ascii=False, indent=2))
    except Exception:
        console.print(r.text)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
