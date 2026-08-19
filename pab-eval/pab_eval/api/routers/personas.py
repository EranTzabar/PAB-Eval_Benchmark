"""Persona CRUD."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

from pab_eval.api.deps import get_state
from pab_eval.api.models import PersonaCreateJson
from pab_eval.api.stores import (
    create_persona_from_json,
    create_persona_from_zip,
    delete_persona,
    get_persona_manifest,
    list_personas,
    preview_persona,
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
        manifest = get_persona_manifest(get_state().store, persona_id)
        store = get_state().store
        from pab_eval.storage import keys

        prefix = keys.persona_prefix(persona_id)
        files = [k[len(prefix) :] for k in store.list_keys(prefix)]
        return {"manifest": manifest, "files": files}
    except KeyError:
        raise HTTPException(status_code=404, detail="persona not found") from None


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
