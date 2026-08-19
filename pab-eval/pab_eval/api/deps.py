"""FastAPI dependencies."""

from __future__ import annotations

from pab_eval.jobs.events import EventBus
from pab_eval.jobs.manager import JobManager
from pab_eval.storage.base import ObjectStore


class AppState:
    def __init__(self, store: ObjectStore, jobs: JobManager, bus: EventBus) -> None:
        self.store = store
        self.jobs = jobs
        self.bus = bus


_state: AppState | None = None


def set_state(state: AppState) -> None:
    global _state
    _state = state


def get_state() -> AppState:
    if _state is None:
        raise RuntimeError("application state not initialized")
    return _state
