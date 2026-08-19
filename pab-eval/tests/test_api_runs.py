"""API run tests."""

import os

import pytest
from fastapi.testclient import TestClient

from pab_eval.api.app import create_app
from pab_eval.storage.base import InMemoryStore


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("TARGET_API_KEY", "test-key")
    return TestClient(create_app(store=InMemoryStore()))


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
