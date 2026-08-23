"""API dataset view persistence tests."""

import time

import pytest
from fastapi.testclient import TestClient

from pab_eval.api.app import create_app
from pab_eval.storage import keys
from pab_eval.storage.base import InMemoryStore


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("TARGET_API_KEY", "test-key")
    return TestClient(create_app(store=InMemoryStore()))


def _patch_rename(client, old_id: str, new_id: str) -> dict:
    r = client.patch(f"/runs/{old_id}", json={"run_id": new_id})
    if r.status_code == 200:
        return r.json()
    assert r.status_code == 202
    deadline = time.time() + 5.0
    while time.time() < deadline:
        rs = client.get(f"/runs/{old_id}/rename-status")
        if rs.status_code == 200:
            body = rs.json()
            if body["status"] == "completed":
                return body
            if body["status"] == "failed":
                raise AssertionError(body.get("error") or "rename failed")
        time.sleep(0.02)
    raise AssertionError(f"rename timed out for {old_id}")


def test_dataset_view_empty_default():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    r = client.get("/dataset/view")
    assert r.status_code == 200
    body = r.json()
    assert body["rows"] == {}
    assert body["version"] == 1
    assert isinstance(body["dataset_sha256"], str)
    assert body["dataset_sha256"]


def test_dataset_view_put_get_roundtrip():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    payload = {
        "rows": {
            "DIR_001": {
                "run_id": "test-run",
                "response": "hello from model",
            }
        }
    }
    put = client.put("/dataset/view", json=payload)
    assert put.status_code == 200
    got = client.get("/dataset/view").json()
    assert got["rows"]["DIR_001"]["run_id"] == "test-run"
    assert got["rows"]["DIR_001"]["response"] == "hello from model"


def test_dataset_view_put_get_roundtrip_with_scores():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    payload = {
        "rows": {
            "DIR_001": {
                "run_id": "test-run",
                "response": "hello from model",
                "aid": 0,
                "ltf": 4,
                "ebc": 5,
            }
        }
    }
    put = client.put("/dataset/view", json=payload)
    assert put.status_code == 200
    got = client.get("/dataset/view").json()
    row = got["rows"]["DIR_001"]
    assert row["aid"] == 0
    assert row["ltf"] == 4
    assert row["ebc"] == 5


def test_dataset_view_rejects_invalid_aid():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    r = client.put(
        "/dataset/view",
        json={"rows": {"DIR_001": {"run_id": "test-run", "response": "x", "aid": 2}}},
    )
    assert r.status_code == 422


def test_dataset_view_rejects_invalid_ltf():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    r = client.put(
        "/dataset/view",
        json={"rows": {"DIR_001": {"run_id": "test-run", "response": "x", "ltf": 0}}},
    )
    assert r.status_code == 422


def test_dataset_view_rejects_invalid_ebc():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    r = client.put(
        "/dataset/view",
        json={"rows": {"DIR_001": {"run_id": "test-run", "response": "x", "ebc": 6}}},
    )
    assert r.status_code == 422


def test_dataset_view_rejects_unknown_item():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    r = client.put(
        "/dataset/view",
        json={"rows": {"NOT_A_REAL_ID": {"run_id": "test-run", "response": "x"}}},
    )
    assert r.status_code == 422


def test_dataset_view_rejects_invalid_run_id():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    r = client.put(
        "/dataset/view",
        json={"rows": {"DIR_001": {"run_id": "../bad", "response": "x"}}},
    )
    assert r.status_code == 422


def test_patch_dataset_view_run_id_on_rename(client):
    from pab_eval.api.deps import get_state

    state = get_state()
    state.store.put_json(
        keys.dataset_view(),
        {
            "version": 1,
            "updated_at": "2026-03-19T12:00:00+00:00",
            "dataset_sha256": "abc",
            "rows": {
                "DIR_001": {
                    "run_id": "old-name",
                    "response": "kept text",
                    "aid": 0,
                    "ltf": 4,
                    "ebc": 5,
                },
                "DIR_002": {"run_id": "other-run", "response": "other"},
            },
        },
    )
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

    _patch_rename(client, "old-name", "new-name")

    view = state.store.get_json(keys.dataset_view())
    assert view["rows"]["DIR_001"]["run_id"] == "new-name"
    assert view["rows"]["DIR_001"]["response"] == "kept text"
    assert view["rows"]["DIR_001"]["aid"] == 0
    assert view["rows"]["DIR_001"]["ltf"] == 4
    assert view["rows"]["DIR_001"]["ebc"] == 5
    assert view["rows"]["DIR_002"]["run_id"] == "other-run"
