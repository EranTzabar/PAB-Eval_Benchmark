"""Failure gate protocol and reporting."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from pab_eval.retry import Attempt


class Decision(str, Enum):
    CONTINUE = "continue"
    CONTINUE_ALL = "all"
    STOP = "stop"


class FailureDetail(BaseModel):
    item_id: str
    pipe: Literal["generate", "judge"]
    run_id: str
    judge_run_id: str | None = None
    kind: str
    attempts: list[dict] = Field(default_factory=list)
    cumulative_attempts: int = 0
    hint: str = ""
    failed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def hint_for_kind(kind: str) -> str:
    hints = {
        "auth": (
            "every attempt returned auth error. Check TARGET_API_KEY in .env "
            "and that load_env() ran before the client was built."
        ),
        "rate_limit": "rate limited — wait and retry, or lower concurrency.",
        "timeout": "request timed out — check network or increase target.timeout_s.",
        "server": "server error from the provider — usually transient.",
        "parse": "judge returned unparseable output — inspect raw in the failure detail.",
        "unknown": "unexpected error — inspect the attempt details.",
    }
    return hints.get(kind, hints["unknown"])


def build_failure_detail(
    *,
    item_id: str,
    pipe: Literal["generate", "judge"],
    run_id: str,
    judge_run_id: str | None,
    attempts: list[Attempt],
    cumulative_attempts: int,
) -> FailureDetail:
    kind = attempts[-1].kind if attempts else "unknown"
    return FailureDetail(
        item_id=item_id,
        pipe=pipe,
        run_id=run_id,
        judge_run_id=judge_run_id,
        kind=kind,
        attempts=[
            {
                "number": a.number,
                "error": a.error,
                "kind": a.kind,
                "status_code": a.status_code,
                "body_snippet": a.body_snippet,
                "at": a.at,
            }
            for a in attempts
        ],
        cumulative_attempts=cumulative_attempts,
        hint=hint_for_kind(kind),
    )


def render_failure_report(detail: FailureDetail) -> str:
    lines = [
        f"================ ITEM FAILED: {detail.item_id} =================",
        f"pipe            {detail.pipe}",
        f"run_id          {detail.run_id}",
    ]
    if detail.judge_run_id:
        lines.append(f"judge_run_id    {detail.judge_run_id}")
    lines.append(f"kind            {detail.kind}")
    for att in detail.attempts:
        code = att.get("status_code")
        code_s = f"HTTP {code}" if code else att.get("kind", "")
        lines.append(f"attempt {att['number']}  {att.get('at', '')}  {code_s}  {att.get('error', '')}")
    lines.append(f"hint            {detail.hint}")
    lines.append(f"cumulative      {detail.cumulative_attempts} attempts across runs")
    return "\n".join(lines)


class FailureGate(Protocol):
    def decide(self, detail: FailureDetail) -> Decision: ...


class FixedPolicyGate:
    def __init__(self, policy: Literal["abort", "continue"]) -> None:
        self._policy = policy
        self.continue_all = policy == "continue"

    def decide(self, detail: FailureDetail) -> Decision:
        if self._policy == "abort":
            return Decision.STOP
        return Decision.CONTINUE_ALL
