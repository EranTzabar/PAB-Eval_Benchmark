"""Rename a run by moving all objects under runs/{old_id}/ to runs/{new_id}/."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass

from pab_eval.errors import RunConflictError
from pab_eval.storage import keys
from pab_eval.storage.base import ObjectStore

log = logging.getLogger(__name__)

ProgressCallback = Callable[[str, int, int, int], None]


@dataclass(frozen=True)
class RenamePlan:
    noop: bool
    total: int
    resume: bool


def _run_prefix(run_id: str) -> str:
    return f"{keys.run_manifest(run_id).rsplit('/', 1)[0]}/"


def _read_manifest(store: ObjectStore, run_id: str) -> dict | None:
    key = keys.run_manifest(run_id)
    if store.exists(key):
        return store.get_json(key)
    return None


def _same_run(manifest_a: dict, manifest_b: dict) -> bool:
    return (
        manifest_a.get("started_at") == manifest_b.get("started_at")
        and manifest_a.get("config_id") == manifest_b.get("config_id")
    )


def _copy_order(key: str) -> tuple[int, str]:
    if key.endswith("/run.json"):
        return (0, key)
    if key.endswith("/checkpoint.json"):
        return (1, key)
    return (2, key)


def plan_rename(store: ObjectStore, old_id: str, new_id: str) -> RenamePlan:
    keys.validate_id(old_id, "run_id")
    keys.validate_id(new_id, "run_id")
    if old_id == new_id:
        return RenamePlan(noop=True, total=0, resume=False)

    old_prefix = _run_prefix(old_id)
    new_prefix = _run_prefix(new_id)
    old_keys = store.list_keys(old_prefix)
    new_keys = store.list_keys(new_prefix)

    if not old_keys and not new_keys:
        raise KeyError(old_id)

    if not old_keys and new_keys:
        return RenamePlan(noop=True, total=0, resume=False)

    if new_keys:
        old_manifest = _read_manifest(store, old_id)
        new_manifest = _read_manifest(store, new_id)
        if new_manifest and old_manifest and not _same_run(old_manifest, new_manifest):
            raise RunConflictError(f"run already exists: {new_id}")
        if new_manifest and not old_manifest:
            raise RunConflictError(f"run already exists: {new_id}")

    return RenamePlan(noop=False, total=len(old_keys), resume=bool(new_keys))


def _copy_run_prefix(
    store: ObjectStore,
    *,
    old_id: str,
    new_id: str,
    old_prefix: str,
    new_prefix: str,
    old_keys: list[str],
    skip_existing: bool,
    on_progress: ProgressCallback | None,
) -> tuple[int, int]:
    copied = 0
    skipped = 0
    total = len(old_keys)
    if on_progress:
        on_progress("copying", copied, total, skipped)

    for key in sorted(old_keys, key=_copy_order):
        new_key = new_prefix + key[len(old_prefix) :]
        if skip_existing and store.exists(new_key):
            skipped += 1
            if on_progress:
                on_progress("copying", copied, total, skipped)
            continue
        try:
            obj = store.get_json(key)
            if obj.get("run_id") == old_id:
                obj["run_id"] = new_id
            store.put_json(new_key, obj)
        except KeyError:
            text = store.get_text(key)
            store.put_text(new_key, text, "application/octet-stream")
        copied += 1
        if on_progress:
            on_progress("copying", copied, total, skipped)
    return copied, skipped


def rename_run(
    store: ObjectStore,
    old_id: str,
    new_id: str,
    *,
    on_progress: ProgressCallback | None = None,
) -> RenamePlan:
    plan = plan_rename(store, old_id, new_id)
    if plan.noop:
        return plan

    old_prefix = _run_prefix(old_id)
    new_prefix = _run_prefix(new_id)
    old_keys = store.list_keys(old_prefix)

    copied, skipped = _copy_run_prefix(
        store,
        old_id=old_id,
        new_id=new_id,
        old_prefix=old_prefix,
        new_prefix=new_prefix,
        old_keys=old_keys,
        skip_existing=plan.resume,
        on_progress=on_progress,
    )

    if on_progress:
        on_progress("deleting", copied, plan.total, skipped)
    deleted = store.delete_prefix(old_prefix)
    if on_progress:
        on_progress("done", copied, plan.total, skipped)

    log.info(
        "renamed run %s -> %s (%d copied, %d skipped, %d deleted, resume=%s)",
        old_id,
        new_id,
        copied,
        skipped,
        deleted,
        plan.resume,
    )
    return plan
