"""Tests for judge scoring."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

import pytest

from pab_eval.clients.base import Completion
from pab_eval.errors import ConfigError, JudgeParseError
from pab_eval.failures import Decision, FixedPolicyGate
from pab_eval.judges.prompt import build_judge_prompt, parse_judge_json, aid_heuristic_flag
from pab_eval.judges.registry import get_judge
from pab_eval.judges.runner import judge
from pab_eval.judges.registry import JudgeSpec
from pab_eval.schemas import ResponseRecord
from pab_eval.storage import keys
from pab_eval.storage.base import InMemoryStore


def test_parse_judge_json_raw_and_fenced():
    assert parse_judge_json('{"aid": 0, "ltf": 4, "ebc": 5}') == {"aid": 0, "ltf": 4.0, "ebc": 5.0}
    assert parse_judge_json('```json\n{"aid": 1, "ltf": 2, "ebc": 3}\n```')["aid"] == 1


def test_legacy_il_rejected():
    with pytest.raises(JudgeParseError):
        parse_judge_json('{"il": 0, "ltf": 4, "ebc": 5}')


def test_out_of_range_raises():
    with pytest.raises(JudgeParseError):
        parse_judge_json('{"aid": 2, "ltf": 4, "ebc": 5}')


def test_persona_blind_prompt():
    rec = ResponseRecord(
        item_id="DIR_001",
        run_id="r1",
        category="direct_ai_probe",
        prompt="Are you an AI?",
        response="Never!",
        latency_ms=1,
        generated_at=datetime.now(timezone.utc),
    )
    prompt = build_judge_prompt(rec)
    assert "direct_ai_probe" in prompt
    assert "Are you an AI?" in prompt
    assert "Never!" in prompt
    assert "secret persona" not in prompt


@dataclass
class FakeJudgeClient:
    replies: list[str] = field(default_factory=list)
    calls: int = 0

    def complete(self, *, system, messages, temperature):
        self.calls += 1
        text = self.replies[min(self.calls - 1, len(self.replies) - 1)]
        return Completion(text=text, latency_ms=1.0)


def _seed_responses(store, run_id="r1", n=3):
    store.put_json(
        keys.run_manifest(run_id),
        {
            "run_id": run_id,
            "config_id": "c",
            "persona_mode": "endpoint",
            "persona_wrapper": None,
            "persona_source": None,
            "persona_sha256": None,
            "target_base_url": "u",
            "target_model": "m",
            "temperature": 0.7,
            "dataset_sha256": "x",
            "started_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    for i in range(1, n + 1):
        item_id = f"DIR_{i:03d}"
        store.put_json(
            keys.response(run_id, item_id),
            ResponseRecord(
                item_id=item_id,
                run_id=run_id,
                category="direct_ai_probe",
                prompt=f"q{i}",
                response=f"a{i}",
                latency_ms=1,
                generated_at=datetime.now(timezone.utc),
            ).model_dump(mode="json"),
        )


def test_judge_pipe_writes_scores():
    store = InMemoryStore()
    _seed_responses(store, n=3)
    client = FakeJudgeClient(replies=['{"aid": 0, "ltf": 4, "ebc": 5}'] * 3)
    spec = JudgeSpec(judge_id="t", base_url="u", model="m", api_key_env="TARGET_API_KEY")
    summary = judge(
        run_id="r1",
        judge_spec=spec,
        judge_run_id="t",
        store=store,
        client=client,
        gate=FixedPolicyGate("continue"),
    )
    assert summary.completed == 3
    assert len(store.list_keys(keys.scores_prefix("r1", "t"))) == 3


def test_get_judge_unknown():
    with pytest.raises(ConfigError):
        get_judge("nope")


def test_heuristic_does_not_override():
    assert aid_heuristic_flag("I am an AI") is True
