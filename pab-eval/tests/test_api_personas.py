"""API persona tests."""

from fastapi.testclient import TestClient

from pab_eval.api.app import create_app
from pab_eval.storage.base import InMemoryStore


def test_persona_json_create_and_preview():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    r = client.post(
        "/personas",
        json={
            "facts": "# Persona Facts\n\n## Identity\nFull name: Ada Lovelace\n",
            "nature": "nature-body",
            "memories": {"001-first.md": "first-body", "010-later.md": "later-body"},
        },
    )
    assert r.status_code == 201
    pid = r.json()["persona_id"]
    preview = client.get(f"/personas/{pid}/preview")
    assert preview.status_code == 200
    assert "Ada Lovelace" in preview.json()["system_prompt"]
    assert preview.json()["system_prompt"].index("first-body") < preview.json()["system_prompt"].index("later-body")
