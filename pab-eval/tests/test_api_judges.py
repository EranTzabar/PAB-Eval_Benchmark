"""API judge definition tests."""

import pytest
from fastapi.testclient import TestClient

from pab_eval.api.app import create_app
from pab_eval.judges.config import JudgeConfigCreate
from pab_eval.api.stores import create_judge
from pab_eval.storage.base import InMemoryStore


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("TARGET_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_JUDGE_KEY", "judge-key")
    return TestClient(create_app(store=InMemoryStore()))


def _judge_body(judge_id: str = "gpt4o_judge") -> dict:
    return {
        "judge_id": judge_id,
        "name": "GPT-4o Judge",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o",
        "api_key_env": "OPENAI_JUDGE_KEY",
        "temperature": 0.0,
        "notes": "test judge",
    }


def test_create_judge_roundtrip(client):
    r = client.post("/judges", json=_judge_body())
    assert r.status_code == 201
    body = r.json()
    assert body["judge_id"] == "gpt4o_judge"
    assert body["api_key_set"] is True
    assert client.get("/judges/gpt4o_judge").status_code == 200


def test_list_judges(client):
    client.post("/judges", json=_judge_body())
    r = client.get("/judges")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_update_judge(client):
    client.post("/judges", json=_judge_body())
    r = client.put(
        "/judges/gpt4o_judge",
        json={
            "name": "Updated",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o-mini",
            "api_key_env": "OPENAI_JUDGE_KEY",
            "temperature": 0.1,
            "notes": "",
        },
    )
    assert r.status_code == 200
    assert r.json()["model"] == "gpt-4o-mini"


def test_delete_judge(client):
    client.post("/judges", json=_judge_body())
    assert client.delete("/judges/gpt4o_judge").status_code == 204
    assert client.get("/judges/gpt4o_judge").status_code == 404


def test_duplicate_judge_rejected(client):
    client.post("/judges", json=_judge_body())
    r = client.post("/judges", json=_judge_body())
    assert r.status_code == 409


def test_invalid_api_key_env_rejected(client):
    body = _judge_body("bad_env_judge")
    body["api_key_env"] = "lowercase_key"
    r = client.post("/judges", json=body)
    assert r.status_code == 422


def test_env_status_includes_judge_key(client):
    client.post("/judges", json=_judge_body())
    r = client.get("/env/status")
    assert r.status_code == 200
    assert "OPENAI_JUDGE_KEY" in r.json()


def test_start_judge_requires_api_key(client, monkeypatch):
    store = InMemoryStore()
    create_judge(
        store,
        JudgeConfigCreate.model_validate(_judge_body("no_key_judge") | {"api_key_env": "MISSING_JUDGE_KEY"}),
    )
    monkeypatch.delenv("MISSING_JUDGE_KEY", raising=False)
    app_client = TestClient(create_app(store=store))
    from pab_eval.storage import keys
    from datetime import datetime, timezone

    store.put_json(
        keys.run_manifest("r1"),
        {
            "run_id": "r1",
            "config_id": "c1",
            "persona_mode": "endpoint",
            "target_base_url": "u",
            "target_model": "m",
            "temperature": 0.7,
            "started_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    r = app_client.post(
        "/runs/r1/judges",
        json={"judge_ids": ["no_key_judge"], "on_failure": "abort"},
    )
    assert r.status_code == 400
    assert "MISSING_JUDGE_KEY" in r.json()["detail"]
