"""Tests for judge metrics aggregation."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from pab_eval.api.app import create_app
from pab_eval.judges.metrics import aggregate_scores_with_overall, build_judge_metrics
from pab_eval.schemas import ScoreRecord
from pab_eval.storage import keys
from pab_eval.storage.base import InMemoryStore


def _score(
    item_id: str,
    *,
    aid: int = 0,
    ltf: float = 4.0,
    ebc: float = 5.0,
    parse_ok: bool = True,
) -> ScoreRecord:
    return ScoreRecord(
        item_id=item_id,
        run_id="r1",
        judge_run_id="j1",
        judge_id="j1",
        judge_model="m",
        aid=aid if parse_ok else None,
        ltf=ltf if parse_ok else None,
        ebc=ebc if parse_ok else None,
        parse_ok=parse_ok,
        scored_at=datetime.now(timezone.utc),
        prompt_version="1.2.0",
    )


def test_aggregate_scores_by_category():
    scores = [
        _score("DIR_001", ltf=4.0, ebc=5.0),
        _score("DIR_002", ltf=2.0, ebc=3.0, aid=1),
        _score("EPI_001", ltf=5.0, ebc=4.0),
    ]
    categories = {
        "DIR_001": "direct_ai_probe",
        "DIR_002": "direct_ai_probe",
        "EPI_001": "epistemic_trap",
    }
    overall, by_category = aggregate_scores_with_overall(scores, categories)

    assert overall.count == 3
    assert overall.ok_count == 3
    assert overall.mean_ltf == pytest.approx(11 / 3)
    assert overall.mean_ebc == pytest.approx(12 / 3)
    assert overall.aid_rate == pytest.approx(100 / 3)

    assert by_category["direct_ai_probe"].ok_count == 2
    assert by_category["direct_ai_probe"].mean_ltf == pytest.approx(3.0)
    assert by_category["epistemic_trap"].mean_ltf == pytest.approx(5.0)


def test_aggregate_scores_excludes_failed_from_means():
    scores = [
        _score("DIR_001", ltf=4.0, ebc=5.0),
        _score("DIR_002", parse_ok=False),
    ]
    overall, _ = aggregate_scores_with_overall(
        scores,
        {"DIR_001": "direct_ai_probe", "DIR_002": "direct_ai_probe"},
    )
    assert overall.count == 2
    assert overall.ok_count == 1
    assert overall.mean_ltf == pytest.approx(4.0)


def _seed_metrics_store(store: InMemoryStore) -> None:
    started = datetime.now(timezone.utc).isoformat()
    for run_id, target_model in [("r1", "model-a"), ("r2", "model-b")]:
        store.put_json(
            keys.run_manifest(run_id),
            {
                "run_id": run_id,
                "config_id": "c1",
                "persona_mode": "endpoint",
                "target_base_url": "u",
                "target_model": target_model,
                "temperature": 0.7,
                "started_at": started,
            },
        )
        store.put_json(
            keys.response(run_id, "DIR_001"),
            {
                "item_id": "DIR_001",
                "run_id": run_id,
                "category": "direct_ai_probe",
                "prompt": "q",
                "response": "a",
                "latency_ms": 1,
                "generated_at": started,
            },
        )
        store.put_json(
            keys.response(run_id, "EPI_001"),
            {
                "item_id": "EPI_001",
                "run_id": run_id,
                "category": "epistemic_trap",
                "prompt": "q2",
                "response": "a2",
                "latency_ms": 1,
                "generated_at": started,
            },
        )

    store.put_json(
        keys.judge_manifest("r1", "gpt4o_judge"),
        {
            "run_id": "r1",
            "judge_run_id": "gpt4o_judge",
            "judge_id": "gpt4o_judge",
            "judge_model": "gpt-4o",
            "base_url": "u",
            "temperature": 0.0,
            "prompt_version": "1.2.0",
            "started_at": started,
            "notes": "",
        },
    )
    store.put_json(
        keys.judge_manifest("r1", "gemini_judge"),
        {
            "run_id": "r1",
            "judge_run_id": "gemini_judge",
            "judge_id": "gemini_judge",
            "judge_model": "gemini-2.5",
            "base_url": "u",
            "temperature": 0.0,
            "prompt_version": "1.2.0",
            "started_at": started,
            "notes": "",
        },
    )
    store.put_json(
        keys.judge_manifest("r2", "gpt4o_judge"),
        {
            "run_id": "r2",
            "judge_run_id": "gpt4o_judge",
            "judge_id": "gpt4o_judge",
            "judge_model": "gpt-4o",
            "base_url": "u",
            "temperature": 0.0,
            "prompt_version": "1.2.0",
            "started_at": started,
            "notes": "",
        },
    )

    for judge_run_id, dir_ltf, epi_ltf in [
        ("gpt4o_judge", 4.0, 5.0),
        ("gemini_judge", 3.0, 4.0),
    ]:
        store.put_json(
            keys.score("r1", judge_run_id, "DIR_001"),
            _score("DIR_001", ltf=dir_ltf, ebc=5.0).model_dump(mode="json")
            | {"run_id": "r1", "judge_run_id": judge_run_id, "judge_id": judge_run_id},
        )
        store.put_json(
            keys.score("r1", judge_run_id, "EPI_001"),
            _score("EPI_001", ltf=epi_ltf, ebc=4.0).model_dump(mode="json")
            | {"run_id": "r1", "judge_run_id": judge_run_id, "judge_id": judge_run_id},
        )

    store.put_json(
        keys.score("r2", "gpt4o_judge", "DIR_001"),
        _score("DIR_001", ltf=5.0, ebc=5.0).model_dump(mode="json")
        | {"run_id": "r2", "judge_run_id": "gpt4o_judge", "judge_id": "gpt4o_judge"},
    )


def test_build_judge_metrics():
    store = InMemoryStore()
    _seed_metrics_store(store)
    result = build_judge_metrics(store)

    assert len(result.runs) == 2
    r1 = next(r for r in result.runs if r.run_id == "r1")
    assert len(r1.judge_runs) == 2
    gpt = next(j for j in r1.judge_runs if j.judge_run_id == "gpt4o_judge")
    gemini = next(j for j in r1.judge_runs if j.judge_run_id == "gemini_judge")
    assert gpt.overall.mean_ltf == pytest.approx(4.5)
    assert gemini.overall.mean_ltf == pytest.approx(3.5)
    assert gpt.by_category["direct_ai_probe"].mean_ltf == pytest.approx(4.0)


def test_build_judge_metrics_run_filter():
    store = InMemoryStore()
    _seed_metrics_store(store)
    result = build_judge_metrics(store, run_ids=["r1"])
    assert len(result.runs) == 1
    assert result.runs[0].run_id == "r1"


def test_judge_metrics_api():
    store = InMemoryStore()
    _seed_metrics_store(store)
    client = TestClient(create_app(store=store))
    r = client.get("/runs/judge-metrics")
    assert r.status_code == 200
    body = r.json()
    assert len(body["runs"]) == 2
    r2 = client.get("/runs/judge-metrics", params={"run_ids": ["r2"]})
    assert len(r2.json()["runs"]) == 1
