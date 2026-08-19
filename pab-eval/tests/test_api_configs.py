"""API config tests."""

from fastapi.testclient import TestClient

from pab_eval.api.app import create_app
from pab_eval.storage.base import InMemoryStore


def test_create_config_roundtrip():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    body = {
        "name": "test",
        "target": {"base_url": "https://api.openai.com/v1", "model": "gpt-4o"},
        "persona": {"mode": "harness", "system_prompt": "You are a blacksmith."},
    }
    r = client.post("/configs", json=body)
    assert r.status_code == 201
    config_id = r.json()["config_id"]
    assert client.get(f"/configs/{config_id}").status_code == 200


def test_api_key_rejected():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    body = {
        "name": "bad",
        "target": {"base_url": "u", "model": "m", "api_key": "secret"},
        "persona": {"mode": "endpoint"},
    }
    r = client.post("/configs", json=body)
    assert r.status_code == 422


def test_api_key_env_in_target_rejected():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    body = {
        "name": "bad",
        "target": {"base_url": "u", "model": "m", "api_key_env": "TARGET_API_KEY"},
        "persona": {"mode": "endpoint"},
    }
    r = client.post("/configs", json=body)
    assert r.status_code == 422


def test_endpoint_with_system_prompt_rejected():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    body = {
        "name": "bad",
        "target": {"base_url": "u", "model": "m"},
        "persona": {"mode": "endpoint", "system_prompt": "x"},
    }
    r = client.post("/configs", json=body)
    assert r.status_code == 422
