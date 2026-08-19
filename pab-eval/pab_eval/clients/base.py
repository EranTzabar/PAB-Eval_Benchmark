"""Model client protocol."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class Completion:
    text: str
    latency_ms: float
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class ModelClient(Protocol):
    def complete(
        self,
        *,
        system: str | None,
        messages: list[dict],
        temperature: float,
    ) -> Completion: ...
