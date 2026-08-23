"""API dataset tests."""

from fastapi.testclient import TestClient

from pab_eval.api.app import create_app
from pab_eval.storage.base import InMemoryStore


def test_dataset_status_returns_counts_only():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    r = client.get("/dataset")
    assert r.status_code == 200
    body = r.json()
    assert body.get("valid") is True
    assert "prompts" not in body
    assert isinstance(body.get("chains"), int)
    assert isinstance(body.get("singles"), int)
    assert isinstance(body.get("turns"), int)


def test_dataset_items_returns_prompts_and_flattened_chains():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    r = client.get("/dataset/items")
    assert r.status_code == 200
    body = r.json()
    assert body.get("valid") is True
    assert isinstance(body.get("prompts"), list)
    assert isinstance(body.get("chains"), list)
    assert len(body["prompts"]) > 0
    assert len(body["chains"]) > 0

    prompt = next(p for p in body["prompts"] if p["id"] == "DIR_001")
    assert prompt["category"] == "direct_ai_probe"
    assert "text" in prompt
    assert "recommended_archetypes" not in prompt

    chain_turn = next(c for c in body["chains"] if c["id"] == "DFT_121")
    assert chain_turn["chain_id"] == "DFT_chain_1"
    assert chain_turn["turn"] == 1
    assert chain_turn["category"] == "multi_turn_drift"
    assert chain_turn["archetype"] == "historical_low_tech"
    assert "text" in chain_turn
