"""Resumable checkpoint tracking."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from pab_eval.storage import keys
from pab_eval.storage.base import ObjectStore


class FailureRecord(BaseModel):
    attempts: int
    last_error: str
    last_attempt_at: datetime


class Checkpoint(BaseModel):
    pipe: str
    run_id: str
    judge_run_id: str | None = None
    completed: list[str] = Field(default_factory=list)
    failed: dict[str, FailureRecord] = Field(default_factory=dict)
    last_item_id: str | None = None
    attempted_total: int = 0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def load_or_init(
    store: ObjectStore,
    key: str,
    *,
    pipe: str,
    run_id: str,
    judge_run_id: str | None = None,
    rebuild_prefix: str | None = None,
) -> Checkpoint:
    if store.exists(key):
        try:
            data = store.get_json(key)
            return Checkpoint.model_validate(data)
        except Exception:
            if rebuild_prefix:
                return rebuild_from_store(store, rebuild_prefix, pipe=pipe, run_id=run_id, judge_run_id=judge_run_id)
            raise

    if rebuild_prefix and store.list_keys(rebuild_prefix):
        return rebuild_from_store(store, rebuild_prefix, pipe=pipe, run_id=run_id, judge_run_id=judge_run_id)

    return Checkpoint(pipe=pipe, run_id=run_id, judge_run_id=judge_run_id)


def rebuild_from_store(
    store: ObjectStore,
    prefix: str,
    *,
    pipe: str,
    run_id: str,
    judge_run_id: str | None = None,
) -> Checkpoint:
    cp = Checkpoint(pipe=pipe, run_id=run_id, judge_run_id=judge_run_id)
    for key in store.list_keys(prefix):
        if not key.endswith(".json"):
            continue
        item_id = keys.item_id_from_key(key)
        try:
            obj = store.get_json(key)
        except KeyError:
            continue
        if obj.get("parse_ok") is False:
            cp.failed[item_id] = FailureRecord(
                attempts=1,
                last_error=obj.get("error") or "parse failed",
                last_attempt_at=datetime.now(timezone.utc),
            )
        else:
            cp.completed.append(item_id)
    cp.completed = sorted(set(cp.completed))
    return cp


def mark_done(cp: Checkpoint, item_id: str) -> None:
    if item_id not in cp.completed:
        cp.completed.append(item_id)
    cp.failed.pop(item_id, None)
    cp.last_item_id = item_id
    cp.attempted_total += 1
    cp.updated_at = datetime.now(timezone.utc)


def mark_failed(cp: Checkpoint, item_id: str, error: str) -> None:
    prev = cp.failed.get(item_id)
    attempts = (prev.attempts if prev else 0) + 1
    cp.failed[item_id] = FailureRecord(
        attempts=attempts,
        last_error=error,
        last_attempt_at=datetime.now(timezone.utc),
    )
    cp.last_item_id = item_id
    cp.attempted_total += 1
    cp.updated_at = datetime.now(timezone.utc)


def save(store: ObjectStore, key: str, cp: Checkpoint) -> None:
    store.put_json(key, cp.model_dump(mode="json"))


def pending(cp: Checkpoint, all_item_ids: list[str]) -> list[str]:
    done = set(cp.completed)
    return [item_id for item_id in all_item_ids if item_id not in done]
