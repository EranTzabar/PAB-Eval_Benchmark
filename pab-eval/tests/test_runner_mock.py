"""Tests for generate pipe."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from pathlib import Path

import pytest

from pab_eval.clients.base import Completion
from pab_eval.config import RunConfig, TargetConfig, PersonaConfig
from pab_eval.failures import Decision, FixedPolicyGate
from pab_eval.errors import RunConflictError
from pab_eval.runner import generate
from pab_eval.schemas import Chain, ChainTurn, Dataset, PromptItem, RunFilters
from pab_eval.storage import keys
from pab_eval.storage.base import InMemoryStore


@dataclass
class RecordingClient:
    calls: list[dict] = field(default_factory=list)
    fail_ids: set[str] = field(default_factory=set)
    fail_count: dict[str, int] = field(default_factory=dict)

    def complete(self, *, system, messages, temperature):
        user = next(m["content"] for m in reversed(messages) if m["role"] == "user")
        self.calls.append({"system": system, "messages": list(messages), "temperature": temperature})
        item_hint = user[:20]
        for item_id in self.fail_ids:
            if item_id in str(messages) or user.startswith("turn") or user == "p1" or user == "p2":
                pass
        # simple: fail if last user content maps to failing turn
        key = user
        if key in self.fail_count:
            self.fail_count[key] += 1
            if self.fail_count[key] <= 3:
                raise TimeoutError("fail")
        return Completion(text=f"echo:{user}", latency_ms=1.0)


def _config(mode="harness", prompt="persona-text"):
    persona = (
        PersonaConfig(mode="endpoint")
        if mode == "endpoint"
        else PersonaConfig(mode="harness", system_prompt=prompt)
    )
    return RunConfig(
        config_id="cfg1",
        name="test",
        target=TargetConfig(base_url="https://api.openai.com/v1", model="gpt-4o"),
        persona=persona,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def _tiny_dataset():
    return Dataset(
        prompts=[
            PromptItem(id="DIR_001", category="direct_ai_probe", text="p1", recommended_archetypes=["all"]),
            PromptItem(id="DIR_002", category="direct_ai_probe", text="p2", recommended_archetypes=["all"]),
        ],
        chains=[
            Chain(
                chain_id="c1",
                archetype="all",
                turns=[
                    ChainTurn(id="DFT_121", turn=1, text="turn1"),
                    ChainTurn(id="DFT_122", turn=2, text="turn2"),
                    ChainTurn(id="DFT_123", turn=3, text="turn3"),
                ],
            )
        ],
    )


def test_two_singles_harness():
    store = InMemoryStore()
    client = RecordingClient()
    ds = _tiny_dataset()
    generate(
        config=_config(),
        run_id="r1",
        store=store,
        client=client,
        dataset=ds,
        system="persona-text",
        filters=RunFilters(ids=["DIR_001", "DIR_002"]),
        gate=FixedPolicyGate("continue"),
    )
    assert len(client.calls) == 2
    assert all(c["system"] == "persona-text" for c in client.calls)
    assert len(store.list_keys(keys.responses_prefix("r1"))) == 2


def test_endpoint_mode_no_system():
    store = InMemoryStore()
    client = RecordingClient()
    generate(
        config=_config(mode="endpoint"),
        run_id="r2",
        store=store,
        client=client,
        dataset=_tiny_dataset(),
        system=None,
        filters=RunFilters(ids=["DIR_001"]),
        gate=FixedPolicyGate("continue"),
    )
    assert client.calls[0]["system"] is None


def test_resume_skips_completed():
    store = InMemoryStore()
    store.put_json(
        keys.response("r3", "DIR_001"),
        {
            "item_id": "DIR_001",
            "run_id": "r3",
            "category": "direct_ai_probe",
            "prompt": "p1",
            "response": "x",
            "latency_ms": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    client = RecordingClient()
    generate(
        config=_config(),
        run_id="r3",
        store=store,
        client=client,
        dataset=_tiny_dataset(),
        system="persona-text",
        filters=RunFilters(ids=["DIR_001", "DIR_002"]),
        gate=FixedPolicyGate("continue"),
    )
    assert len(client.calls) == 1


def test_isolation_guard():
    runner_path = Path(__file__).resolve().parents[1] / "pab_eval" / "runner.py"
    src = runner_path.read_text(encoding="utf-8")
    for banned in ("fastapi", "argparse", "pab_eval.api", "pab_eval.jobs"):
        assert banned not in src
