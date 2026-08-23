"""Judge definition CRUD."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from pab_eval.api.deps import get_state
from pab_eval.api.stores import (
    create_judge,
    delete_judge,
    get_judge_config,
    list_judge_ids,
    update_judge,
)
from pab_eval.errors import ConfigError
from pab_eval.judges.config import JudgeConfigCreate, JudgeConfigUpdate
from pab_eval.storage import keys

router = APIRouter(prefix="/judges", tags=["judges"])


def _judge_payload(config) -> dict:
    data = config.model_dump(mode="json")
    data["api_key_set"] = bool(os.environ.get(config.api_key_env))
    return data


@router.get("")
def list_all():
    store = get_state().store
    return [_judge_payload(get_judge_config(store, judge_id)) for judge_id in list_judge_ids(store)]


@router.post("", status_code=201)
def create(body: JudgeConfigCreate):
    try:
        config = create_judge(get_state().store, body)
    except ConfigError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _judge_payload(config)


@router.get("/{judge_id}")
def get_one(judge_id: str):
    try:
        config = get_judge_config(get_state().store, judge_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="judge not found") from None
    return _judge_payload(config)


@router.put("/{judge_id}")
def update(judge_id: str, body: JudgeConfigUpdate):
    try:
        config = update_judge(get_state().store, judge_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="judge not found") from None
    return _judge_payload(config)


@router.delete("/{judge_id}", status_code=204)
def delete(judge_id: str):
    store = get_state().store
    if not store.exists(keys.judge_def(judge_id)):
        raise HTTPException(status_code=404, detail="judge not found")
    delete_judge(store, judge_id)
