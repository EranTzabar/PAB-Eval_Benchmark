"""Config and persona CRUD over ObjectStore."""

from __future__ import annotations

import io
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from pab_eval.config import RunConfig, RunConfigCreate
from pab_eval.dataset_view import (
    DatasetView,
    DatasetViewUpdate,
    empty_dataset_view,
    known_item_ids,
    load_current_dataset_sha,
    prune_rows,
    validate_rows,
)
from pab_eval.errors import ConfigError, DatasetError
from pab_eval.judges.config import JudgeConfig, JudgeConfigCreate, JudgeConfigUpdate
from pab_eval.persona import LocalDirSource, R2PersonaSource, compose_persona
from pab_eval.schemas import PersonaManifest
from pab_eval.storage import keys
from pab_eval.storage.base import ObjectStore


def list_configs(store: ObjectStore) -> list[str]:
    return sorted(
        keys.item_id_from_key(k)
        for k in store.list_keys(keys.configs_prefix())
        if k.endswith(".json")
    )


def get_config(store: ObjectStore, config_id: str) -> RunConfig:
    raw = store.get_json(keys.config(config_id))
    if isinstance(raw.get("target"), dict):
        raw = dict(raw)
        raw["target"] = dict(raw["target"])
        raw["target"].pop("api_key_env", None)
    return RunConfig.model_validate(raw)


def create_config(store: ObjectStore, body: RunConfigCreate) -> RunConfig:
    config_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc)
    config = RunConfig(
        config_id=config_id,
        name=body.name,
        target=body.target,
        persona=body.persona,
        created_at=now,
        updated_at=now,
    )
    store.put_json(keys.config(config_id), config.model_dump(mode="json"))
    return config


def update_config(store: ObjectStore, config_id: str, body: RunConfigCreate) -> RunConfig:
    existing = get_config(store, config_id)
    updated = existing.model_copy(
        update={
            "name": body.name,
            "target": body.target,
            "persona": body.persona,
            "updated_at": datetime.now(timezone.utc),
        }
    )
    store.put_json(keys.config(config_id), updated.model_dump(mode="json"))
    return updated


def delete_config(store: ObjectStore, config_id: str) -> None:
    store.delete(keys.config(config_id))


def list_judge_ids(store: ObjectStore) -> list[str]:
    return sorted(
        keys.item_id_from_key(k)
        for k in store.list_keys(keys.judges_defs_prefix())
        if k.endswith(".json")
    )


def get_judge_config(store: ObjectStore, judge_id: str) -> JudgeConfig:
    return JudgeConfig.model_validate(store.get_json(keys.judge_def(judge_id)))


def list_judge_configs(store: ObjectStore) -> list[JudgeConfig]:
    return [get_judge_config(store, judge_id) for judge_id in list_judge_ids(store)]


def create_judge(store: ObjectStore, body: JudgeConfigCreate) -> JudgeConfig:
    if store.exists(keys.judge_def(body.judge_id)):
        raise ConfigError(f"judge already exists: {body.judge_id}")
    now = datetime.now(timezone.utc)
    config = JudgeConfig(
        judge_id=body.judge_id,
        name=body.name,
        base_url=body.base_url,
        model=body.model,
        api_key_env=body.api_key_env,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
        notes=body.notes,
        created_at=now,
        updated_at=now,
    )
    store.put_json(keys.judge_def(body.judge_id), config.model_dump(mode="json"))
    return config


def update_judge(store: ObjectStore, judge_id: str, body: JudgeConfigUpdate) -> JudgeConfig:
    existing = get_judge_config(store, judge_id)
    updated = existing.model_copy(
        update={
            "name": body.name,
            "base_url": body.base_url,
            "model": body.model,
            "api_key_env": body.api_key_env,
            "temperature": body.temperature,
            "max_tokens": body.max_tokens,
            "notes": body.notes,
            "updated_at": datetime.now(timezone.utc),
        }
    )
    store.put_json(keys.judge_def(judge_id), updated.model_dump(mode="json"))
    return updated


def delete_judge(store: ObjectStore, judge_id: str) -> None:
    store.delete(keys.judge_def(judge_id))


def list_personas(store: ObjectStore) -> list[PersonaManifest]:
    manifests: list[PersonaManifest] = []
    for key in store.list_keys(keys.personas_prefix()):
        if key.endswith("/manifest.json"):
            manifests.append(PersonaManifest.model_validate(store.get_json(key)))
    return sorted(manifests, key=lambda m: m.persona_id)


def get_persona_manifest(store: ObjectStore, persona_id: str) -> PersonaManifest:
    return PersonaManifest.model_validate(store.get_json(keys.persona_manifest(persona_id)))


def _write_persona_files(
    store: ObjectStore,
    persona_id: str,
    files: dict[str, str],
) -> PersonaManifest:
    source = _memory_source_from_files(files)
    compose_persona(source, wrapper="minimal")

    now = datetime.now(timezone.utc)
    memory_files = sorted(
        p.split("/", 1)[1]
        for p in files
        if p.startswith("memories/") and p.endswith(".md")
    )
    manifest = PersonaManifest(
        persona_id=persona_id,
        name=None,
        archetype=None,
        memory_files=memory_files,
        created_at=now,
        updated_at=now,
    )
    for relpath, content in files.items():
        store.put_text(
            keys.persona_file(persona_id, relpath),
            content,
            "text/markdown" if relpath.endswith(".md") else "application/json",
        )
    store.put_json(keys.persona_manifest(persona_id), manifest.model_dump(mode="json"))
    return manifest


class _MemoryPersonaSource:
    def __init__(self, files: dict[str, str], label: str) -> None:
        self._files = files
        self.label = label

    def read_text(self, relpath: str) -> str:
        if relpath not in self._files:
            raise KeyError(relpath)
        return self._files[relpath]

    def exists(self, relpath: str) -> bool:
        return relpath in self._files

    def memory_filenames(self) -> list[str]:
        return [p.split("/", 1)[1] for p in self._files if p.startswith("memories/") and p.endswith(".md")]


def _memory_source_from_files(files: dict[str, str]) -> _MemoryPersonaSource:
    return _MemoryPersonaSource(files, "upload")


def create_persona_from_json(
    store: ObjectStore,
    *,
    persona_id: str | None,
    facts: str,
    nature: str,
    memories: dict[str, str],
    name: str | None = None,
    archetype: str | None = None,
) -> PersonaManifest:
    persona_id = persona_id or uuid.uuid4().hex[:12]
    files = {
        "persona_facts.md": facts,
        "persona_nature.md": nature,
        **{f"memories/{k}": v for k, v in memories.items()},
    }
    manifest = _write_persona_files(store, persona_id, files)
    manifest = manifest.model_copy(update={"name": name, "archetype": archetype})
    store.put_json(keys.persona_manifest(persona_id), manifest.model_dump(mode="json"))
    return manifest


def create_persona_from_zip(store: ObjectStore, data: bytes) -> PersonaManifest:
    persona_id = uuid.uuid4().hex[:12]
    files: dict[str, str] = {}
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/").lstrip("/")
            if ".." in name.split("/"):
                raise ConfigError(f"invalid zip entry: {name}")
            files[name] = zf.read(info).decode("utf-8-sig")
    return _write_persona_files(store, persona_id, files)


def delete_persona(store: ObjectStore, persona_id: str) -> None:
    store.delete_prefix(keys.persona_prefix(persona_id))


def preview_persona(store: ObjectStore, persona_id: str, wrapper: str = "minimal", name: str | None = None) -> str:
    source = R2PersonaSource(store, persona_id)
    return compose_persona(source, wrapper=wrapper, name=name)


def seed_persona_from_dir(store: ObjectStore, path: Path, persona_id: str | None = None) -> PersonaManifest:
    persona_id = persona_id or path.name
    source = LocalDirSource(path)
    compose_persona(source)
    files: dict[str, str] = {
        "persona_facts.md": source.read_text("persona_facts.md"),
        "persona_nature.md": source.read_text("persona_nature.md"),
    }
    for mem in source.memory_filenames():
        files[f"memories/{mem}"] = source.read_text(f"memories/{mem}")
    return _write_persona_files(store, persona_id, files)


def get_dataset_view(store: ObjectStore) -> DatasetView:
    dataset, sha = load_current_dataset_sha()
    key = keys.dataset_view()
    if not store.exists(key):
        return empty_dataset_view(sha)
    view = DatasetView.model_validate(store.get_json(key))
    view.rows = prune_rows(view.rows, known_item_ids(dataset))
    return view


def put_dataset_view(store: ObjectStore, body: DatasetViewUpdate) -> DatasetView:
    dataset, sha = load_current_dataset_sha()
    try:
        validate_rows(body.rows, known_item_ids(dataset))
    except ValueError as exc:
        raise DatasetError(str(exc)) from exc
    view = DatasetView(
        updated_at=datetime.now(timezone.utc),
        dataset_sha256=sha,
        rows=body.rows,
    )
    store.put_json(keys.dataset_view(), view.model_dump(mode="json"))
    return view
