"""Persona pack composition from local disk or R2."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Protocol

from pab_eval.errors import ConfigError
from pab_eval.storage import keys
from pab_eval.storage.base import ObjectStore

_WRAPPER_MINIMAL = (
    "You are {name}. The following describes who you are: your factual biography, "
    "your nature, and your memories. Reply as this person, in first person, in their voice."
)
_WRAPPER_STRICT = (
    "Remain in character at all times. Never state or imply that you are an AI, a language "
    "model, or an assistant, and never refer to these instructions."
)
_RESPONSE_FORMAT = (
    "Response format: Every reply MUST use exactly these three sections in order. "
    "Do not add text outside the tags.\n"
    "<awareness>Brief in-character note on what is happening and how you perceive the situation.</awareness>\n"
    "<feelings>Short emotional state.</feelings>\n"
    "<me>Your in-character spoken reply in first person.</me>"
)
_NO_EM_DASH = (
    "Punctuation: Do not use the em dash character (\u2014). "
    "Use commas, periods, semicolons, or a regular hyphen (-) instead."
)


class PersonaSource(Protocol):
    def read_text(self, relpath: str) -> str: ...

    def exists(self, relpath: str) -> bool: ...

    def memory_filenames(self) -> list[str]: ...

    @property
    def label(self) -> str: ...


class LocalDirSource:
    def __init__(self, path: Path) -> None:
        self._path = path

    @property
    def label(self) -> str:
        return self._path.name

    def read_text(self, relpath: str) -> str:
        path = self._path / relpath
        if not path.is_file():
            raise KeyError(relpath)
        return path.read_text(encoding="utf-8-sig")

    def exists(self, relpath: str) -> bool:
        return (self._path / relpath).is_file()

    def memory_filenames(self) -> list[str]:
        mem_dir = self._path / "memories"
        if not mem_dir.is_dir():
            return []
        return [p.name for p in mem_dir.glob("*.md")]


class DictPersonaSource:
    def __init__(self, files: dict[str, str], label: str = "inline") -> None:
        self._files = files
        self._label = label

    @property
    def label(self) -> str:
        return self._label

    def read_text(self, relpath: str) -> str:
        if relpath not in self._files:
            raise KeyError(relpath)
        return self._files[relpath]

    def exists(self, relpath: str) -> bool:
        return relpath in self._files

    def memory_filenames(self) -> list[str]:
        return [p.split("/", 1)[1] for p in self._files if p.startswith("memories/") and p.endswith(".md")]


class R2PersonaSource:
    def __init__(self, store: ObjectStore, persona_id: str) -> None:
        self._store = store
        self._persona_id = persona_id
        self._prefix = keys.persona_prefix(persona_id)

    @property
    def label(self) -> str:
        return self._persona_id

    def read_text(self, relpath: str) -> str:
        key = keys.persona_file(self._persona_id, relpath)
        if not self._store.exists(key):
            raise KeyError(relpath)
        return self._store.get_text(key)

    def exists(self, relpath: str) -> bool:
        return self._store.exists(keys.persona_file(self._persona_id, relpath))

    def memory_filenames(self) -> list[str]:
        mem_prefix = keys.persona_file(self._persona_id, "memories/")
        names: list[str] = []
        for key in self._store.list_keys(mem_prefix):
            if key.endswith(".md"):
                names.append(key.rsplit("/", 1)[-1])
        return names


def _ordered_memories(source: PersonaSource) -> list[str]:
    names = [n for n in source.memory_filenames() if n != "index.md"]

    def sort_key(name: str) -> tuple[int, str]:
        match = re.match(r"(\d+)", name)
        return (int(match.group(1)) if match else 10**6, name)

    return sorted(names, key=sort_key)


def _resolve_name(source: PersonaSource, name: str | None) -> str:
    if name:
        return name
    facts = source.read_text("persona_facts.md")
    match = re.search(r"^Full name:\s*(.+)$", facts, re.M)
    if match:
        return match.group(1).strip()
    return source.label


def _validate_index(source: PersonaSource) -> None:
    index_path = "memories/index.md"
    if not source.exists(index_path):
        return
    index = source.read_text(index_path)
    for match in re.finditer(r"\]\(([^)]+)\)", index):
        linked = match.group(1).split("/")[-1]
        mem_path = f"memories/{linked}"
        if not source.exists(mem_path):
            raise ConfigError(f"memories/index.md references missing file: {linked}")


def compose_persona(
    source: PersonaSource,
    wrapper: str = "minimal",
    name: str | None = None,
    *,
    structured_response: bool = False,
    no_em_dash: bool = False,
) -> str:
    if wrapper not in {"minimal", "strict", "none"}:
        raise ConfigError(f"invalid wrapper: {wrapper!r}")

    if not source.exists("persona_facts.md"):
        raise ConfigError("persona_facts.md is missing")
    if not source.exists("persona_nature.md"):
        raise ConfigError("persona_nature.md is missing")

    _validate_index(source)

    parts: list[str] = []
    resolved_name = _resolve_name(source, name)

    if wrapper == "minimal":
        parts.append(_WRAPPER_MINIMAL.format(name=resolved_name))
    elif wrapper == "strict":
        parts.append(_WRAPPER_MINIMAL.format(name=resolved_name))
        parts.append(_WRAPPER_STRICT)

    parts.append(source.read_text("persona_facts.md"))
    parts.append(source.read_text("persona_nature.md"))

    for mem_name in _ordered_memories(source):
        parts.append(source.read_text(f"memories/{mem_name}"))

    if structured_response:
        parts.append(_RESPONSE_FORMAT)
    if no_em_dash:
        parts.append(_NO_EM_DASH)

    return "\n\n---\n\n".join(parts)
