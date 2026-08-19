"""Thread-to-asyncio event bridge for SSE."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel

from pab_eval.failures import FailureDetail
from pab_eval.jobs.manager import Job


class Event(BaseModel):
    type: Literal[
        "snapshot",
        "progress",
        "item_done",
        "item_failed",
        "awaiting_decision",
        "decision",
        "finished",
        "error",
    ]
    job: Job
    detail: FailureDetail | None = None
    at: datetime


class EventBus:
    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._subscribers: list[asyncio.Queue[Event]] = []

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def publish(self, event: Event) -> None:
        if event.at is None:
            event.at = datetime.now(timezone.utc)
        for queue in list(self._subscribers):
            if self._loop and self._loop.is_running():
                self._loop.call_soon_threadsafe(queue.put_nowait, event)
            else:
                try:
                    queue.put_nowait(event)
                except Exception:
                    pass

    def subscribe(self) -> asyncio.Queue[Event]:
        queue: asyncio.Queue[Event] = asyncio.Queue()
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[Event]) -> None:
        if queue in self._subscribers:
            self._subscribers.remove(queue)

    async def stream(self, queue: asyncio.Queue[Event]) -> AsyncIterator[Event]:
        while True:
            event = await queue.get()
            yield event
            if event.type in ("finished", "error"):
                break
