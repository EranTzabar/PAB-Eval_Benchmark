"""Dataset viewer state persisted in R2."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from pab_eval.dataset import load_dataset
from pab_eval.schemas import Dataset
from pab_eval.storage import keys
from pab_eval.storage.base import ObjectStore

DATASET_VIEW_VERSION = 1


def dataset_sha256(dataset: Dataset) -> str:
    payload = dataset.model_dump_json()
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def known_item_ids(dataset: Dataset) -> set[str]:
    ids = {p.id for p in dataset.prompts}
    for chain in dataset.chains:
        ids.update(t.id for t in chain.turns)
    return ids


class DatasetViewRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    response: str | None = None
    aid: int | None = None
    ltf: float | None = None
    ebc: float | None = None


class DatasetView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = DATASET_VIEW_VERSION
    updated_at: datetime
    dataset_sha256: str
    rows: dict[str, DatasetViewRow] = Field(default_factory=dict)


class DatasetViewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rows: dict[str, DatasetViewRow] = Field(default_factory=dict)


def empty_dataset_view(current_sha: str) -> DatasetView:
    return DatasetView(
        updated_at=datetime.now(timezone.utc),
        dataset_sha256=current_sha,
        rows={},
    )


def prune_rows(rows: dict[str, DatasetViewRow], valid_ids: set[str]) -> dict[str, DatasetViewRow]:
    return {item_id: row for item_id, row in rows.items() if item_id in valid_ids}


def validate_manual_scores(row: DatasetViewRow) -> None:
    if row.aid is not None and row.aid not in (0, 1):
        raise ValueError(f"aid out of range: {row.aid}")
    if row.ltf is not None and not (1 <= row.ltf <= 5):
        raise ValueError(f"ltf out of range: {row.ltf}")
    if row.ebc is not None and not (1 <= row.ebc <= 5):
        raise ValueError(f"ebc out of range: {row.ebc}")


def validate_rows(rows: dict[str, DatasetViewRow], valid_ids: set[str]) -> None:
    unknown = set(rows.keys()) - valid_ids
    if unknown:
        sample = sorted(unknown)[0]
        raise ValueError(f"unknown item_id in rows: {sample}")
    for item_id, row in rows.items():
        keys.validate_id(row.run_id, "run_id")
        validate_manual_scores(row)


def patch_dataset_view_run_id(store: ObjectStore, old_id: str, new_id: str) -> bool:
    """Rewrite run_id in saved rows when a generate run is renamed. Returns True if updated."""
    if old_id == new_id:
        return False
    key = keys.dataset_view()
    if not store.exists(key):
        return False
    view = DatasetView.model_validate(store.get_json(key))
    changed = False
    for row in view.rows.values():
        if row.run_id == old_id:
            row.run_id = new_id
            changed = True
    if not changed:
        return False
    view.updated_at = datetime.now(timezone.utc)
    store.put_json(key, view.model_dump(mode="json"))
    return True


def load_current_dataset_sha() -> tuple[Dataset, str]:
    from pab_eval.dataset import default_dataset_paths

    prompts_path, chains_path = default_dataset_paths()
    dataset = load_dataset(prompts_path, chains_path)
    return dataset, dataset_sha256(dataset)
