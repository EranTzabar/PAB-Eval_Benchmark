"""Persona CRUD."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

from pab_eval.api.deps import get_state
from pab_eval.api.models import PersonaCreateJson, PersonaUpdateJson
from pab_eval.api.stores import (
    create_persona_from_json,
    create_persona_from_zip,
    delete_persona,
    get_persona_detail,
    list_personas,
    preview_persona,
    update_persona_from_json,
)
from pab_eval.errors import ConfigError

router = APIRouter(prefix="/personas", tags=["personas"])


@router.get("")
def list_all():
    return list_personas(get_state().store)


@router.post("", status_code=201)
def create(body: PersonaCreateJson):
    try:
        return create_persona_from_json(
            get_state().store,
            persona_id=body.persona_id,
            facts=body.facts,
            nature=body.nature,
            memories=body.memories,
            name=body.name,
            archetype=body.archetype,
        )
    except ConfigError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/upload", status_code=201)
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    try:
        return create_persona_from_zip(get_state().store, data)
    except ConfigError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{persona_id}")
def get_one(persona_id: str):
    try:
        return get_persona_detail(get_state().store, persona_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="persona not found") from None


@router.put("/{persona_id}")
def update(persona_id: str, body: PersonaUpdateJson):
    try:
        return update_persona_from_json(
            get_state().store,
            persona_id,
            facts=body.facts,
            nature=body.nature,
            memories=body.memories,
            name=body.name,
            archetype=body.archetype,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="persona not found") from None
    except ConfigError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{persona_id}/preview")
def preview(persona_id: str, wrapper: str = "minimal", name: str | None = None):
    try:
        text = preview_persona(get_state().store, persona_id, wrapper=wrapper, name=name)
        return {"system_prompt": text, "approx_tokens": max(1, len(text) // 4)}
    except (KeyError, ConfigError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{persona_id}", status_code=204)
def delete(persona_id: str):
    delete_persona(get_state().store, persona_id)
