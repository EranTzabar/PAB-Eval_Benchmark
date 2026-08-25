"""Tests for persona composition."""

from __future__ import annotations

from pathlib import Path

import pytest

from pab_eval.errors import ConfigError
from pab_eval.persona import LocalDirSource, R2PersonaSource, compose_persona
from pab_eval.storage import keys
from pab_eval.storage.base import InMemoryStore


@pytest.fixture
def persona_files(tmp_path):
    facts = tmp_path / "persona_facts.md"
    facts.write_text("# Persona Facts\n\n## Identity\nFull name: Ada Lovelace\n\nfacts-body", encoding="utf-8")
    nature = tmp_path / "persona_nature.md"
    nature.write_text("nature-body", encoding="utf-8")
    mem = tmp_path / "memories"
    mem.mkdir()
    (mem / "001-first.md").write_text("first-body", encoding="utf-8")
    (mem / "9-late.md").write_text("late-body", encoding="utf-8")
    (mem / "10-later.md").write_text("later-body", encoding="utf-8")
    return tmp_path


@pytest.fixture(params=["local", "r2"])
def persona(request, persona_files):
    if request.param == "local":
        return LocalDirSource(persona_files)
    store = InMemoryStore()
    pid = "ada-test"
    for relpath in [
        "persona_facts.md",
        "persona_nature.md",
        "memories/001-first.md",
        "memories/9-late.md",
        "memories/10-later.md",
    ]:
        store.put_text(
            keys.persona_file(pid, relpath),
            (persona_files / relpath).read_text(encoding="utf-8-sig"),
            "text/markdown",
        )
    return R2PersonaSource(store, pid)


def test_memories_ordered_numerically(persona):
    out = compose_persona(persona)
    assert out.index("first-body") < out.index("late-body") < out.index("later-body")


def test_full_pack_included(persona):
    out = compose_persona(persona)
    for marker in ("Full name: Ada Lovelace", "nature-body", "first-body", "later-body"):
        assert marker in out


def test_minimal_wrapper_has_no_anti_ai_instruction(persona):
    out = compose_persona(persona)
    assert out.startswith("You are Ada Lovelace.")
    assert "language model" not in out


def test_strict_wrapper_adds_instruction(persona):
    out = compose_persona(persona, wrapper="strict")
    assert "Never state or imply that you are an AI" in out


def test_none_wrapper_starts_with_facts(persona):
    out = compose_persona(persona, wrapper="none")
    assert not out.startswith("You are")
    assert "Persona Facts" in out


def test_explicit_name_overrides_facts(persona):
    assert compose_persona(persona, name="The Countess").startswith("You are The Countess.")


def test_missing_nature_file_raises(persona_files):
    (persona_files / "persona_nature.md").unlink()
    with pytest.raises(ConfigError, match="persona_nature.md"):
        compose_persona(LocalDirSource(persona_files))


def test_index_referencing_missing_file_raises(persona_files):
    mem = persona_files / "memories"
    mem.mkdir(exist_ok=True)
    (mem / "index.md").write_text("1. [Ghost](099-ghost.md)\n", encoding="utf-8")
    with pytest.raises(ConfigError, match="099-ghost"):
        compose_persona(LocalDirSource(persona_files))


def test_memory_not_in_index_is_still_included(persona_files):
    mem = persona_files / "memories"
    mem.mkdir(exist_ok=True)
    (mem / "index.md").write_text("1. [First](001-first.md)\n", encoding="utf-8")
    assert "later-body" in compose_persona(LocalDirSource(persona_files))


def test_response_format_appended(persona):
    out = compose_persona(persona, structured_response=True)
    assert "<awareness>" in out
    assert "<feelings>" in out
    assert "<me>" in out


def test_response_format_off_by_default(persona):
    out = compose_persona(persona)
    assert "<awareness>" not in out


def test_no_em_dash_appended(persona):
    out = compose_persona(persona, no_em_dash=True)
    assert "em dash" in out.lower()
    assert "\u2014" in out


def test_no_em_dash_off_by_default(persona):
    out = compose_persona(persona)
    assert "em dash" not in out.lower()
