"""Tests for job manager and parking gate."""

from __future__ import annotations

import threading
import time

import pytest

from pab_eval.failures import Decision, build_failure_detail
from pab_eval.jobs.events import EventBus
from pab_eval.jobs.gate import ApiFailureGate
from pab_eval.errors import JobAlreadyRunningError
from pab_eval.jobs.manager import JobManager, JobState
from pab_eval.retry import Attempt
from pab_eval.schemas import Progress, RunSummary


def _detail():
    return build_failure_detail(
        item_id="DIR_001",
        pipe="generate",
        run_id="r1",
        judge_run_id=None,
        attempts=[Attempt(1, "err", "timeout")],
        cumulative_attempts=1,
    )


def test_job_completes():
    jobs = JobManager()

    def work(ctx):
        return RunSummary(run_id="r1", completed=1, failed=0)

    job = jobs.start("generate:r1", "generate", "r1", work)
    jobs._threads["generate:r1"].join(timeout=2)
    final = jobs.get("generate:r1")
    assert final.state == JobState.completed


def test_duplicate_job_raises():
    jobs = JobManager()
    event = threading.Event()

    def work(ctx):
        event.wait(5)
        return RunSummary(run_id="r1", completed=0, failed=0)

    jobs.start("generate:r1", "generate", "r1", work)
    with pytest.raises(JobAlreadyRunningError):
        jobs.start("generate:r1", "generate", "r1", work)
    jobs.cancel("generate:r1")
    jobs.shutdown(timeout_s=2)


def test_api_gate_unblocks_on_decision():
    bus = EventBus()
    jobs = JobManager()
    cancel = threading.Event()
    from pab_eval.jobs.manager import Job

    job = Job(job_id="generate:r1", kind="generate", run_id="r1")
    gate = ApiFailureGate(job, bus, cancel)

    result = {}

    def run():
        result["decision"] = gate.decide(_detail())

    t = threading.Thread(target=run)
    t.start()
    time.sleep(0.2)
    assert job.state == JobState.awaiting_decision
    gate.submit(Decision.CONTINUE)
    t.join(timeout=2)
    assert result["decision"] == Decision.CONTINUE


def test_cancel_while_parked():
    bus = EventBus()
    cancel = threading.Event()
    from pab_eval.jobs.manager import Job

    job = Job(job_id="generate:r1", kind="generate", run_id="r1")
    gate = ApiFailureGate(job, bus, cancel)
    result = {}

    def run():
        result["decision"] = gate.decide(_detail())

    t = threading.Thread(target=run)
    t.start()
    time.sleep(0.2)
    cancel.set()
    t.join(timeout=2)
    assert result["decision"] == Decision.STOP
