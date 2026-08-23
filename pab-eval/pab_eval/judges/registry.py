"""Load judge specs from R2-backed definitions."""

from __future__ import annotations

from pab_eval.errors import ConfigError
from pab_eval.judges.config import JudgeSpec
from pab_eval.storage.base import ObjectStore


def get_judge(store: ObjectStore, judge_id: str) -> JudgeSpec:
    from pab_eval.api.stores import get_judge_config, list_judge_ids

    try:
        return get_judge_config(store, judge_id).to_spec()
    except KeyError:
        known = ", ".join(sorted(list_judge_ids(store))) or "(none)"
        raise ConfigError(f"unknown judge {judge_id!r}; known judges: {known}") from None


def list_judge_specs(store: ObjectStore) -> list[JudgeSpec]:
    from pab_eval.api.stores import list_judge_configs

    return [cfg.to_spec() for cfg in list_judge_configs(store)]
