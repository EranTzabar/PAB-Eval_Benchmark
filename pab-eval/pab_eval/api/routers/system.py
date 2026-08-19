"""System endpoints."""

from __future__ import annotations

import os

from fastapi import APIRouter

from pab_eval.config import env_status
from pab_eval.judges.registry import JUDGES

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/env/status")
def env_status_route() -> dict[str, bool]:
    required = [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "TARGET_API_KEY",
    ]
    required.extend(spec.api_key_env for spec in JUDGES.values())
    return env_status(sorted(set(required)))
