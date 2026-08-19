"""Retry wrapper with per-attempt diagnostics."""

from __future__ import annotations

import os
import re
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import TypeVar

import httpx

from pab_eval.errors import JudgeParseError

T = TypeVar("T")

MAX_ATTEMPTS = 3
BACKOFF_BASE_S = 2.0

_SECRET_PATTERN = re.compile(
    r"(Bearer\s+\S+|sk-[A-Za-z0-9_-]+)",
    re.I,
)


class Attempt:
    def __init__(
        self,
        number: int,
        error: str,
        kind: str,
        status_code: int | None = None,
        body_snippet: str | None = None,
    ) -> None:
        self.number = number
        self.error = error
        self.kind = kind
        self.status_code = status_code
        self.body_snippet = body_snippet
        self.at = datetime.now(timezone.utc).isoformat()


class AttemptsExhausted(Exception):
    def __init__(self, attempts: list[Attempt]) -> None:
        super().__init__(f"failed after {len(attempts)} attempts")
        self.attempts = attempts


def _scrub(text: str) -> str:
    out = _SECRET_PATTERN.sub("***", text)
    for name, value in os.environ.items():
        if value and (
            name.endswith("_KEY")
            or name.endswith("_SECRET")
            or name.endswith("_TOKEN")
        ):
            out = out.replace(value, "***")
    return out[:500]


def classify(exc: Exception) -> str:
    if isinstance(exc, JudgeParseError):
        return "parse"
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code in (401, 403):
            return "auth"
        if code == 429:
            return "rate_limit"
        if code >= 500:
            return "server"
        return "unknown"
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)):
        return "timeout"
    return "unknown"


def _body_snippet(exc: Exception) -> str | None:
    if isinstance(exc, httpx.HTTPStatusError):
        try:
            return _scrub(exc.response.text)
        except Exception:
            return None
    return _scrub(str(exc))[:500]


def call_with_retries(
    fn: Callable[[], T],
    *,
    on_attempt: Callable[[Attempt], None] | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> T:
    attempts: list[Attempt] = []
    last_exc: Exception | None = None

    for attempt_no in range(1, MAX_ATTEMPTS + 1):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            attempt = Attempt(
                number=attempt_no,
                error=f"{exc.__class__.__name__}: {exc}",
                kind=classify(exc),
                status_code=(
                    exc.response.status_code
                    if isinstance(exc, httpx.HTTPStatusError)
                    else None
                ),
                body_snippet=_body_snippet(exc),
            )
            attempts.append(attempt)
            if on_attempt:
                on_attempt(attempt)
            if attempt_no < MAX_ATTEMPTS:
                sleep(BACKOFF_BASE_S ** attempt_no)

    raise AttemptsExhausted(attempts) from last_exc
