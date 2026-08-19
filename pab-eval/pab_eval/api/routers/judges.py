"""Judge registry introspection."""

from __future__ import annotations

from fastapi import APIRouter

from pab_eval.judges.registry import list_judges

router = APIRouter(prefix="/judges", tags=["judges"])


@router.get("")
def judges():
    return [
        {
            "judge_id": j.judge_id,
            "model": j.model,
            "base_url": j.base_url,
            "api_key_env": j.api_key_env,
            "temperature": j.temperature,
            "notes": j.notes,
        }
        for j in list_judges()
    ]
