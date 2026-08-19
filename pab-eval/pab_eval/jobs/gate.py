"""Parking failure gate for API-driven runs."""

from __future__ import annotations

import threading

from pab_eval.failures import Decision, FailureDetail, FailureGate
from pab_eval.jobs.events import Event, EventBus
from pab_eval.jobs.manager import Job, JobState


class ApiFailureGate(FailureGate):
    def __init__(self, job: Job, bus: EventBus, cancel_event: threading.Event) -> None:
        self._job = job
        self._bus = bus
        self._cancel = cancel_event
        self._answered = threading.Event()
        self._decision: Decision = Decision.STOP
        self.continue_all = False

    def decide(self, detail: FailureDetail) -> Decision:
        if self.continue_all:
            return Decision.CONTINUE_ALL

        self._job.state = JobState.awaiting_decision
        self._job.pending_decision = detail
        self._answered.clear()
        self._bus.publish(
            Event(type="awaiting_decision", job=self._job.model_copy(deep=True), detail=detail, at=detail.failed_at)
        )

        while not self._answered.wait(timeout=0.5):
            if self._cancel.is_set():
                return Decision.STOP

        if self._decision == Decision.CONTINUE_ALL:
            self.continue_all = True
        self._job.state = JobState.running
        self._job.pending_decision = None
        self._bus.publish(
            Event(type="decision", job=self._job.model_copy(deep=True), detail=detail, at=detail.failed_at)
        )
        return self._decision

    def submit(self, decision: Decision) -> None:
        self._decision = decision
        self._answered.set()
