"""Tests for checkpoint."""

from datetime import datetime, timezone

import pytest

from pab_eval.checkpoint import (
    Checkpoint,
    FailureRecord,
    load_or_init,
    mark_done,
    mark_failed,
    pending,
    rebuild_from_store,
    save,
)
from pab_eval.storage.base import InMemoryStore


def test_pending_excludes_completed_and_includes_failed():
    store = InMemoryStore()
    cp = load_or_init(store, "k", pipe="judge", run_id="r1")
    mark_done(cp, "DIR_001")
    mark_failed(cp, "DIR_002", "timeout")
    assert pending(cp, ["DIR_001", "DIR_002", "DIR_003"]) == ["DIR_002", "DIR_003"]


def test_failed_attempts_accumulate_across_runs():
    store = InMemoryStore()
    cp = load_or_init(store, "k", pipe="judge", run_id="r1")
    mark_failed(cp, "DIR_002", "timeout")
    save(store, "k", cp)
    cp2 = load_or_init(store, "k", pipe="judge", run_id="r1")
    mark_failed(cp2, "DIR_002", "timeout")
    assert cp2.failed["DIR_002"].attempts == 2


def test_success_clears_prior_failure():
    cp = Checkpoint(pipe="judge", run_id="r1")
    mark_failed(cp, "DIR_002", "timeout")
    mark_done(cp, "DIR_002")
    assert "DIR_002" not in cp.failed
    assert "DIR_002" in cp.completed


def test_missing_checkpoint_rebuilds_from_stored_objects():
    store = InMemoryStore()
    store.put_json("runs/r1/j/g/scores/DIR_001.json", {"parse_ok": True})
    store.put_json("runs/r1/j/g/scores/DIR_002.json", {"parse_ok": False})
    cp = load_or_init(
        store,
        "missing/key.json",
        pipe="judge",
        run_id="r1",
        rebuild_prefix="runs/r1/j/g/scores/",
    )
    assert cp.completed == ["DIR_001"]
    assert "DIR_002" in cp.failed
