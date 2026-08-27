"""API run tests."""

import time

import pytest
from fastapi.testclient import TestClient

from pab_eval.api.app import create_app
from pab_eval.storage.base import InMemoryStore


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("TARGET_API_KEY", "test-key")
    return TestClient(create_app(store=InMemoryStore()))


def _wait_rename(client, old_id: str, timeout_s: float = 5.0) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        r = client.get(f"/runs/{old_id}/rename-status")
        if r.status_code == 200:
            body = r.json()
            if body["status"] == "completed":
                return body
            if body["status"] == "failed":
                raise AssertionError(body.get("error") or "rename failed")
        time.sleep(0.02)
    raise AssertionError(f"rename timed out for {old_id}")


def _patch_rename(client, old_id: str, new_id: str) -> dict:
    r = client.patch(f"/runs/{old_id}", json={"run_id": new_id})
    if r.status_code == 200:
        return r.json()
    assert r.status_code == 202
    return _wait_rename(client, old_id)


def test_health(client):
    assert client.get("/health").status_code == 200


def test_env_status(client):
    r = client.get("/env/status")
    assert r.status_code == 200
    assert r.json()["TARGET_API_KEY"] is True


def test_unsafe_run_id_rejected(client):
    cfg = client.post(
        "/configs",
        json={
            "name": "t",
            "target": {"base_url": "https://api.openai.com/v1", "model": "gpt-4o"},
            "persona": {"mode": "endpoint"},
        },
    ).json()
    r = client.post(
        "/runs",
        json={"config_id": cfg["config_id"], "run_id": "../escape", "on_failure": "abort"},
    )
    assert r.status_code == 422


def test_list_all_judge_runs(client):
    from datetime import datetime, timezone

    from pab_eval.api.deps import get_state
    from pab_eval.storage import keys

    state = get_state()
    started = datetime.now(timezone.utc).isoformat()
    state.store.put_json(
        keys.run_manifest("r1"),
        {
            "run_id": "r1",
            "config_id": "c1",
            "persona_mode": "endpoint",
            "target_base_url": "u",
            "target_model": "m",
            "temperature": 0.7,
            "started_at": started,
        },
    )
    state.store.put_json(
        keys.response("r1", "DIR_001"),
        {
            "item_id": "DIR_001",
            "run_id": "r1",
            "category": "direct_ai_probe",
            "prompt": "q",
            "response": "a",
            "latency_ms": 1,
            "generated_at": started,
        },
    )
    state.store.put_json(
        keys.judge_manifest("r1", "gemini_judge"),
        {
            "run_id": "r1",
            "judge_run_id": "gemini_judge",
            "judge_id": "gemini_judge",
            "judge_model": "gemini-2.5-flash-lite",
            "base_url": "https://example.com",
            "temperature": 0.0,
            "prompt_version": "1.1.0",
            "started_at": started,
            "notes": "",
        },
    )
    state.store.put_json(
        keys.judge_checkpoint("r1", "gemini_judge"),
        {
            "pipe": "judge",
            "run_id": "r1",
            "judge_run_id": "gemini_judge",
            "completed": ["DIR_001"],
            "failed": {},
            "last_item_id": "DIR_001",
            "attempted_total": 1,
            "updated_at": started,
        },
    )

    r = client.get("/runs/judge-runs")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["run_id"] == "r1"
    assert body[0]["judge_run_id"] == "gemini_judge"
    assert body[0]["manifest"]["judge_id"] == "gemini_judge"
    assert body[0]["progress"]["completed"] == 1


def test_delete_judge_run_removes_storage(client):
    from pab_eval.api.deps import get_state
    from pab_eval.storage import keys

    state = get_state()
    started = "2026-03-19T12:00:00+00:00"
    state.store.put_json(
        keys.run_manifest("r1"),
        {
            "run_id": "r1",
            "config_id": "c1",
            "persona_mode": "endpoint",
            "target_base_url": "u",
            "target_model": "m",
            "temperature": 0.7,
            "started_at": started,
        },
    )
    state.store.put_json(
        keys.judge_manifest("r1", "gpt5_judge"),
        {
            "run_id": "r1",
            "judge_run_id": "gpt5_judge",
            "judge_id": "gpt5_judge",
            "judge_model": "gpt-4o",
            "base_url": "https://example.com",
            "temperature": 0.0,
            "prompt_version": "1.2.0",
            "started_at": started,
            "notes": "",
        },
    )
    state.store.put_json(
        keys.score("r1", "gpt5_judge", "DIR_001"),
        {
            "item_id": "DIR_001",
            "run_id": "r1",
            "judge_run_id": "gpt5_judge",
            "aid": 0,
            "ltf": 4,
            "ebc": 5,
            "parse_ok": True,
        },
    )

    assert client.delete("/runs/r1/judges/gpt5_judge").status_code == 204
    assert state.store.list_keys(keys.judge_run_prefix("r1", "gpt5_judge")) == []
    assert client.get("/runs/r1/judges/gpt5_judge").status_code == 404
    assert client.get("/runs/r1").status_code == 200


def test_delete_judge_run_not_found(client):
    assert client.delete("/runs/r1/judges/missing").status_code == 404


def test_list_runs_returns_run_id_from_manifest_key(client):
    from pab_eval.api.deps import get_state

    state = get_state()
    state.store.put_json(
        "runs/lema_32_4B_sft/run.json",
        {
            "run_id": "lema_32_4B_sft",
            "config_id": "cfg1",
            "persona_mode": "endpoint",
            "target_base_url": "http://127.0.0.1:8000/v1",
            "target_model": "lema",
            "temperature": 0.7,
            "started_at": "2026-03-19T12:00:00+00:00",
        },
    )
    state.store.put_json(
        "runs/smoke-test/run.json",
        {
            "run_id": "smoke-test",
            "config_id": "cfg1",
            "persona_mode": "endpoint",
            "target_base_url": "http://127.0.0.1:8000/v1",
            "target_model": "lema",
            "temperature": 0.7,
            "started_at": "2026-03-20T12:00:00+00:00",
        },
    )

    runs = client.get("/runs").json()
    assert sorted(r["run_id"] for r in runs) == ["lema_32_4B_sft", "smoke-test"]
    by_id = {r["run_id"]: r for r in runs}
    assert by_id["lema_32_4B_sft"]["manifest"]["config_id"] == "cfg1"


def test_rename_run(client):
    from pab_eval.api.deps import get_state

    state = get_state()
    state.store.put_json(
        "runs/old-name/run.json",
        {
            "run_id": "old-name",
            "config_id": "cfg1",
            "persona_mode": "endpoint",
            "target_base_url": "http://127.0.0.1:8000/v1",
            "target_model": "lema",
            "temperature": 0.7,
            "dataset_sha256": "abc",
            "started_at": "2026-03-19T12:00:00+00:00",
        },
    )
    state.store.put_json(
        "runs/old-name/responses/DIR_001.json",
        {
            "item_id": "DIR_001",
            "run_id": "old-name",
            "category": "direct_ai_probe",
            "prompt": "hi",
            "response": "hello",
            "latency_ms": 1.0,
            "generated_at": "2026-03-19T12:01:00+00:00",
        },
    )

    result = _patch_rename(client, "old-name", "new-name")
    assert result["status"] == "completed"
    assert result["new_run_id"] == "new-name"

    runs = {item["run_id"]: item for item in client.get("/runs").json()}
    assert "old-name" not in runs
    assert runs["new-name"]["manifest"]["run_id"] == "new-name"

    resp = client.get("/runs/new-name/responses/DIR_001").json()
    assert resp["run_id"] == "new-name"


def test_rename_run_resumes_partial_copy(client):
    from pab_eval.api.deps import get_state

    state = get_state()
    manifest = {
        "run_id": "old-name",
        "config_id": "cfg1",
        "persona_mode": "endpoint",
        "target_base_url": "http://127.0.0.1:8000/v1",
        "target_model": "lema",
        "temperature": 0.7,
        "dataset_sha256": "abc",
        "started_at": "2026-03-19T12:00:00+00:00",
    }
    state.store.put_json("runs/old-name/run.json", manifest)
    state.store.put_json("runs/old-name/responses/DIR_001.json", {
        "item_id": "DIR_001",
        "run_id": "old-name",
        "category": "direct_ai_probe",
        "prompt": "hi",
        "response": "hello",
        "latency_ms": 1.0,
        "generated_at": "2026-03-19T12:01:00+00:00",
    })
    state.store.put_json(
        "runs/new-name/run.json",
        {**manifest, "run_id": "new-name"},
    )

    _patch_rename(client, "old-name", "new-name")

    runs = {item["run_id"]: item for item in client.get("/runs").json()}
    assert "old-name" not in runs
    assert "new-name" in runs
    assert client.get("/runs/new-name/responses/DIR_001").json()["run_id"] == "new-name"


def test_rename_run_reports_status(client):
    from pab_eval.api.deps import get_state

    state = get_state()
    state.store.put_json(
        "runs/old-name/run.json",
        {
            "run_id": "old-name",
            "config_id": "cfg1",
            "persona_mode": "endpoint",
            "target_base_url": "http://127.0.0.1:8000/v1",
            "target_model": "lema",
            "temperature": 0.7,
            "dataset_sha256": "abc",
            "started_at": "2026-03-19T12:00:00+00:00",
        },
    )

    r = client.patch("/runs/old-name", json={"run_id": "new-name"})
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "in_progress"
    assert body["total"] == 1

    final = _wait_rename(client, "old-name")
    assert final["status"] == "completed"
    assert final["copied"] == 1


def test_rename_run_skips_existing_objects_on_resume(client):
    from pab_eval.api.deps import get_state

    state = get_state()
    manifest = {
        "run_id": "old-name",
        "config_id": "cfg1",
        "persona_mode": "endpoint",
        "target_base_url": "http://127.0.0.1:8000/v1",
        "target_model": "lema",
        "temperature": 0.7,
        "dataset_sha256": "abc",
        "started_at": "2026-03-19T12:00:00+00:00",
    }
    state.store.put_json("runs/old-name/run.json", manifest)
    state.store.put_json(
        "runs/old-name/responses/DIR_001.json",
        {
            "item_id": "DIR_001",
            "run_id": "old-name",
            "category": "direct_ai_probe",
            "prompt": "hi",
            "response": "hello",
            "latency_ms": 1.0,
            "generated_at": "2026-03-19T12:01:00+00:00",
        },
    )
    state.store.put_json(
        "runs/old-name/responses/DIR_002.json",
        {
            "item_id": "DIR_002",
            "run_id": "old-name",
            "category": "direct_ai_probe",
            "prompt": "hi2",
            "response": "hello2",
            "latency_ms": 1.0,
            "generated_at": "2026-03-19T12:02:00+00:00",
        },
    )
    state.store.put_json("runs/new-name/run.json", {**manifest, "run_id": "new-name"})
    state.store.put_json(
        "runs/new-name/responses/DIR_001.json",
        {
            "item_id": "DIR_001",
            "run_id": "new-name",
            "category": "direct_ai_probe",
            "prompt": "hi",
            "response": "hello",
            "latency_ms": 1.0,
            "generated_at": "2026-03-19T12:01:00+00:00",
        },
    )

    _patch_rename(client, "old-name", "new-name")
    assert "old-name" not in {item["run_id"] for item in client.get("/runs").json()}
    assert client.get("/runs/new-name/responses/DIR_002").json()["run_id"] == "new-name"


def test_rename_run_idempotent_when_already_moved(client):
    from pab_eval.api.deps import get_state

    state = get_state()
    state.store.put_json(
        "runs/new-name/run.json",
        {
            "run_id": "new-name",
            "config_id": "cfg1",
            "persona_mode": "endpoint",
            "target_base_url": "http://127.0.0.1:8000/v1",
            "target_model": "lema",
            "temperature": 0.7,
            "dataset_sha256": "abc",
            "started_at": "2026-03-19T12:00:00+00:00",
        },
    )

    result = _patch_rename(client, "old-name", "new-name")
    assert result["status"] == "completed"
    assert len(client.get("/runs").json()) == 1


def test_delete_run_removes_storage_and_dataset_rows(client):
    from pab_eval.api.deps import get_state
    from pab_eval.storage import keys

    state = get_state()
    state.store.put_json(
        keys.run_manifest("gone-run"),
        {
            "run_id": "gone-run",
            "config_id": "cfg1",
            "persona_mode": "endpoint",
            "target_base_url": "https://api.openai.com/v1",
            "target_model": "gpt-4o",
            "temperature": 0.7,
            "dataset_sha256": "abc",
            "started_at": "2026-03-19T12:00:00+00:00",
        },
    )
    state.store.put_json(
        keys.response("gone-run", "DIR_001"),
        {"item_id": "DIR_001", "run_id": "gone-run", "response": "hi"},
    )
    state.store.put_json(
        keys.dataset_view(),
        {
            "version": 1,
            "updated_at": "2026-03-19T12:00:00+00:00",
            "dataset_sha256": "abc",
            "rows": {
                "DIR_001": {"run_id": "gone-run", "response": "hi"},
                "DIR_002": {"run_id": "keep-run", "response": "stay"},
            },
        },
    )

    assert client.delete("/runs/gone-run").status_code == 204
    assert client.get("/runs/gone-run").status_code == 404
    assert state.store.list_keys(keys.run_data_prefix("gone-run")) == []
    view = state.store.get_json(keys.dataset_view())
    assert "DIR_001" not in view["rows"]
    assert view["rows"]["DIR_002"]["run_id"] == "keep-run"


def test_delete_run_not_found(client):
    assert client.delete("/runs/missing-run").status_code == 404
