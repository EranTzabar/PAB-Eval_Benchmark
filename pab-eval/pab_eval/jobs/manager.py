"""Background job manager."""

from __future__ import annotations

import threading
import traceback
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

from pab_eval.errors import JobAlreadyRunningError
from pab_eval.failures import Decision, FailureDetail
from pab_eval.schemas import Progress, RunSummary


class JobState(str, Enum):
    running = "running"
    awaiting_decision = "awaiting_decision"
    completed = "completed"
    failed = "failed"
    stopped = "stopped"
    cancelled = "cancelled"


class Job(BaseModel):
    job_id: str
    kind: Literal["generate", "judge"]
    run_id: str
    judge_run_id: str | None = None
    state: JobState = JobState.running
    progress: Progress = Field(default_factory=lambda: Progress(completed=0, failed=0, remaining=0))
    pending_decision: FailureDetail | None = None
    error: str | None = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None


@dataclass
class JobContext:
    job: Job
    gate: object
    cancel_event: threading.Event = field(default_factory=threading.Event)
    on_progress: Callable[[Progress], None] | None = None


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._threads: dict[str, threading.Thread] = {}
        self._contexts: dict[str, JobContext] = {}
        self._lock = threading.Lock()

    def start(
        self,
        job_id: str,
        kind: Literal["generate", "judge"],
        run_id: str,
        work: Callable[[JobContext], RunSummary],
        *,
        judge_run_id: str | None = None,
        gate: object | None = None,
    ) -> Job:
        with self._lock:
            if job_id in self._threads and self._threads[job_id].is_alive():
                raise JobAlreadyRunningError(f"job already running: {job_id}")

            job = Job(job_id=job_id, kind=kind, run_id=run_id, judge_run_id=judge_run_id)
            ctx = JobContext(job=job, gate=gate or object())
            self._jobs[job_id] = job
            self._contexts[job_id] = ctx

            def runner() -> None:
                try:
                    summary = work(ctx)
                    if summary.cancelled:
                        job.state = JobState.cancelled
                    elif summary.stopped:
                        job.state = JobState.stopped
                    else:
                        job.state = JobState.completed
                    job.progress = Progress(
                        completed=summary.completed,
                        failed=summary.failed,
                        remaining=0,
                    )
                except Exception as exc:
                    job.state = JobState.failed
                    job.error = f"{exc.__class__.__name__}: {exc}\n{traceback.format_exc()}"
                finally:
                    job.finished_at = datetime.now(timezone.utc)

            thread = threading.Thread(target=runner, name=job_id, daemon=False)
            self._threads[job_id] = thread
            thread.start()
            return job.model_copy(deep=True)

    def get(self, job_id: str) -> Job | None:
        job = self._jobs.get(job_id)
        return job.model_copy(deep=True) if job else None

    def list(self) -> list[Job]:
        return [j.model_copy(deep=True) for j in self._jobs.values()]

    def context(self, job_id: str) -> JobContext | None:
        return self._contexts.get(job_id)

    def submit_decision(self, job_id: str, decision: Decision) -> None:
        ctx = self._contexts.get(job_id)
        if ctx is None:
            raise KeyError(job_id)
        job = self._jobs[job_id]
        if job.state != JobState.awaiting_decision:
            raise JobAlreadyRunningError(f"job {job_id} is not awaiting a decision")
        gate = ctx.gate
        if hasattr(gate, "submit"):
            gate.submit(decision)

    def cancel(self, job_id: str) -> None:
        ctx = self._contexts.get(job_id)
        if ctx:
            ctx.cancel_event.set()
        if job_id in self._jobs:
            job = self._jobs[job_id]
            if job.state == JobState.running:
                job.state = JobState.cancelled

    def shutdown(self, timeout_s: float = 30.0) -> None:
        for job_id in list(self._contexts):
            self.cancel(job_id)
        for thread in list(self._threads.values()):
            thread.join(timeout=timeout_s)
