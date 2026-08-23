"""System endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from pab_eval.api.deps import get_state
from pab_eval.api.stores import list_judge_configs
from pab_eval.config import env_status

router = APIRouter(tags=["system"])


def _required_env_vars() -> list[str]:
    required = [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "TARGET_API_KEY",
    ]
    try:
        state = get_state()
        required.extend(cfg.api_key_env for cfg in list_judge_configs(state.store))
    except RuntimeError:
        pass
    return sorted(set(required))


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/env/status")
def env_status_route() -> dict[str, bool]:
    return env_status(_required_env_vars())
