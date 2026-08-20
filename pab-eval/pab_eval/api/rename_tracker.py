"""In-memory status for background run renames."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Literal


@dataclass
class RenameStatus:
    old_run_id: str
    new_run_id: str
    status: Literal["in_progress", "completed", "failed"]
    phase: Literal["copying", "deleting", "done"] = "copying"
    copied: int = 0
    total: int = 0
    skipped: int = 0
    error: str | None = None


class RenameTracker:
    def __init__(self) -> None:
        self._ops: dict[str, RenameStatus] = {}
        self._lock = threading.Lock()

    def start(self, old_run_id: str, new_run_id: str, total: int) -> RenameStatus:
        op = RenameStatus(
            old_run_id=old_run_id,
            new_run_id=new_run_id,
            status="in_progress",
            phase="copying",
            total=total,
        )
        with self._lock:
            self._ops[old_run_id] = op
        return op

    def get(self, old_run_id: str) -> RenameStatus | None:
        with self._lock:
            op = self._ops.get(old_run_id)
            if op is None:
                return None
            return RenameStatus(**op.__dict__)

    def update(
        self,
        old_run_id: str,
        *,
        phase: Literal["copying", "deleting", "done"] | None = None,
        copied: int | None = None,
        skipped: int | None = None,
    ) -> None:
        with self._lock:
            op = self._ops.get(old_run_id)
            if op is None:
                return
            if phase is not None:
                op.phase = phase
            if copied is not None:
                op.copied = copied
            if skipped is not None:
                op.skipped = skipped

    def complete(self, old_run_id: str) -> None:
        with self._lock:
            op = self._ops.get(old_run_id)
            if op is None:
                return
            op.status = "completed"
            op.phase = "done"

    def fail(self, old_run_id: str, error: str) -> None:
        with self._lock:
            op = self._ops.get(old_run_id)
            if op is None:
                return
            op.status = "failed"
            op.phase = "done"
            op.error = error

    def clear(self, old_run_id: str) -> None:
        with self._lock:
            self._ops.pop(old_run_id, None)
