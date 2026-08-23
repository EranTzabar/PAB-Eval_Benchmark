"""R2 key construction — every key string is built here."""

from __future__ import annotations

import re

_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def validate_id(value: str, label: str = "id") -> str:
    if not _ID_PATTERN.match(value):
        raise ValueError(f"invalid {label}: {value!r}")
    return value


def _run(run_id: str) -> str:
    validate_id(run_id, "run_id")
    return f"runs/{run_id}"


def run_manifest(run_id: str) -> str:
    return f"{_run(run_id)}/run.json"


def response(run_id: str, item_id: str) -> str:
    return f"{_run(run_id)}/responses/{item_id}.json"


def responses_prefix(run_id: str) -> str:
    return f"{_run(run_id)}/responses/"


def judge_manifest(run_id: str, judge_run_id: str) -> str:
    validate_id(judge_run_id, "judge_run_id")
    return f"{_run(run_id)}/judges/{judge_run_id}/judge.json"


def score(run_id: str, judge_run_id: str, item_id: str) -> str:
    validate_id(judge_run_id, "judge_run_id")
    return f"{_run(run_id)}/judges/{judge_run_id}/scores/{item_id}.json"


def scores_prefix(run_id: str, judge_run_id: str) -> str:
    validate_id(judge_run_id, "judge_run_id")
    return f"{_run(run_id)}/judges/{judge_run_id}/scores/"


def judges_prefix(run_id: str) -> str:
    return f"{_run(run_id)}/judges/"


def generate_checkpoint(run_id: str) -> str:
    return f"{_run(run_id)}/checkpoint.json"


def judge_checkpoint(run_id: str, judge_run_id: str) -> str:
    validate_id(judge_run_id, "judge_run_id")
    return f"{_run(run_id)}/judges/{judge_run_id}/checkpoint.json"


def generate_failure(run_id: str, item_id: str) -> str:
    return f"{_run(run_id)}/failures/{item_id}.json"


def judge_failure(run_id: str, judge_run_id: str, item_id: str) -> str:
    validate_id(judge_run_id, "judge_run_id")
    return f"{_run(run_id)}/judges/{judge_run_id}/failures/{item_id}.json"


def item_id_from_key(key: str) -> str:
    name = key.rsplit("/", 1)[-1]
    if name.endswith(".json"):
        return name[:-5]
    return name


def run_id_from_manifest_key(key: str) -> str | None:
    """Extract run_id from ``runs/{run_id}/run.json``."""
    if not key.endswith("/run.json"):
        return None
    parts = key.split("/")
    if len(parts) == 3 and parts[0] == "runs":
        return parts[1]
    return None


def config(config_id: str) -> str:
    validate_id(config_id, "config_id")
    return f"configs/{config_id}.json"


def configs_prefix() -> str:
    return "configs/"


def judge_def(judge_id: str) -> str:
    validate_id(judge_id, "judge_id")
    return f"judges/{judge_id}.json"


def judges_defs_prefix() -> str:
    return "judges/"


def persona_manifest(persona_id: str) -> str:
    validate_id(persona_id, "persona_id")
    return f"personas/{persona_id}/manifest.json"


def persona_file(persona_id: str, relpath: str) -> str:
    validate_id(persona_id, "persona_id")
    relpath = relpath.replace("\\", "/").lstrip("/")
    if ".." in relpath.split("/"):
        raise ValueError(f"invalid persona relpath: {relpath!r}")
    return f"personas/{persona_id}/{relpath}"


def persona_prefix(persona_id: str) -> str:
    validate_id(persona_id, "persona_id")
    return f"personas/{persona_id}/"


def personas_prefix() -> str:
    return "personas/"


def runs_prefix() -> str:
    return "runs/"


def dataset_view() -> str:
    return "dataset/view.json"
