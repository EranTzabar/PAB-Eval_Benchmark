"""Config CRUD."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from pab_eval.api.deps import get_state
from pab_eval.api.models import ConfigValidateRequest
from pab_eval.api.stores import (
    create_config,
    delete_config,
    get_config,
    list_configs,
    update_config,
)
from pab_eval.config import RunConfigCreate

router = APIRouter(prefix="/configs", tags=["configs"])


@router.get("")
def list_all() -> list[str]:
    return list_configs(get_state().store)


@router.post("", status_code=201)
def create(body: RunConfigCreate):
    return create_config(get_state().store, body)


@router.get("/{config_id}")
def get_one(config_id: str):
    try:
        return get_config(get_state().store, config_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="config not found") from None


@router.put("/{config_id}")
def update(config_id: str, body: RunConfigCreate):
    try:
        return update_config(get_state().store, config_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="config not found") from None


@router.delete("/{config_id}", status_code=204)
def delete(config_id: str):
    delete_config(get_state().store, config_id)


@router.post("/validate")
def validate(body: ConfigValidateRequest):
    return {"valid": True, "config": body}
