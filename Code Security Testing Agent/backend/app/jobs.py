from __future__ import annotations

import json
import queue
import threading
from collections import defaultdict
from typing import Callable, Dict, Iterable, List

from app.core import SecurityJob, make_id


class InMemoryJobStore:
    def __init__(self) -> None:
        self.jobs: Dict[str, SecurityJob] = {}
        self._queues: Dict[str, List[queue.Queue[str]]] = defaultdict(list)
        self._lock = threading.Lock()

    def create_job(self, session_id: str) -> SecurityJob:
        with self._lock:
            job = SecurityJob(
                id=make_id("job"),
                session_id=session_id,
                status="queued",
                progress=0,
            )
            self.jobs[job.id] = job
            return job

    def update(self, job_id: str, *, status: str | None = None, progress: int | None = None, output: dict | None = None, error_message: str | None = None) -> None:
        with self._lock:
            job = self.jobs[job_id]
            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = progress
            if output is not None:
                job.outputs.append(output)
            if error_message is not None:
                job.error_message = error_message
            payload = json.dumps(
                {
                    "id": job.id,
                    "session_id": job.session_id,
                    "status": job.status,
                    "progress": job.progress,
                    "outputs": job.outputs,
                    "error_message": job.error_message,
                },
                ensure_ascii=False,
            )
            for q in self._queues[job_id]:
                q.put(payload)

    def run_async(self, job_id: str, runner: Callable[[], Iterable[dict]]) -> None:
        def _task() -> None:
            self.update(job_id, status="running", progress=10)
            try:
                for idx, output in enumerate(runner(), start=1):
                    self.update(job_id, output=output, progress=min(95, 10 + idx * 20))
                self.update(job_id, status="finished", progress=100)
            except Exception as exc:  # noqa: BLE001
                self.update(job_id, status="failed", error_message=str(exc), progress=100)

        threading.Thread(target=_task, daemon=True).start()

    def stream(self, job_id: str):
        q: queue.Queue[str] = queue.Queue()
        self._queues[job_id].append(q)
        try:
            job = self.jobs.get(job_id)
            if job is not None:
                yield json.dumps(
                    {
                        "id": job.id,
                        "session_id": job.session_id,
                        "status": job.status,
                        "progress": job.progress,
                        "outputs": job.outputs,
                        "error_message": job.error_message,
                    },
                    ensure_ascii=False,
                )
            while True:
                yield q.get()
        finally:
            self._queues[job_id].remove(q)

