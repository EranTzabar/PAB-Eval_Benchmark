"""SSE snapshot test."""

from fastapi.testclient import TestClient

from pab_eval.api.app import create_app
from pab_eval.storage.base import InMemoryStore


def test_sse_snapshot_on_connect():
    app = create_app(store=InMemoryStore())
    client = TestClient(app)
    # No active job — stream should still open (may immediately end)
    with client.stream("GET", "/runs/smoke/events") as response:
        assert response.status_code == 200
