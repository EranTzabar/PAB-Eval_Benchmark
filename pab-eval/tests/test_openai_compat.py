"""Tests for OpenAI client and RunConfig."""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from pab_eval.clients.openai_compat import OpenAICompatClient
from pab_eval.config import RunConfigCreate, build_client, load_env, resolve_persona
from pab_eval.errors import ConfigError
from pab_eval.judges.registry import JUDGES
from pab_eval.persona import compose_persona
from pab_eval.storage import keys
from pab_eval.storage.base import InMemoryStore


def test_openai_compat_post_and_parse():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "hello"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 2},
            },
        )

    client = OpenAICompatClient(
        "https://api.openai.com/v1",
        "sk-test",
        "gpt-4o",
        transport=httpx.MockTransport(handler),
    )
    out = client.complete(system="sys", messages=[{"role": "user", "content": "hi"}], temperature=0.5)
    assert out.text == "hello"
    assert captured["body"]["messages"][0]["role"] == "system"
    assert captured["body"]["temperature"] == 0.5


def test_system_none_omits_system_message():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "x"}}]})

    client = OpenAICompatClient(
        "https://api.openai.com/v1",
        "sk-test",
        "gpt-4o",
        transport=httpx.MockTransport(handler),
    )
    client.complete(system=None, messages=[{"role": "user", "content": "hi"}], temperature=0.0)
    assert all(m["role"] != "system" for m in captured["body"]["messages"])
    assert len(captured["body"]["messages"]) == 1


def test_persona_config_validation():
    with pytest.raises(ValidationError):
        RunConfigCreate(name="x", target={"base_url": "u", "model": "m"}, persona={"mode": "endpoint", "system_prompt": "x"})
    with pytest.raises(ValidationError):
        RunConfigCreate(name="x", target={"base_url": "u", "model": "m"}, persona={"mode": "harness"})
    with pytest.raises(ValidationError):
        RunConfigCreate(
            name="x",
            target={"base_url": "u", "model": "m"},
            persona={"mode": "harness", "system_prompt": "a", "persona_id": "b"},
        )


def test_legacy_fields_rejected():
    with pytest.raises(ValidationError, match="api_key"):
        RunConfigCreate.model_validate(
            {"name": "x", "target": {"base_url": "u", "model": "m", "api_key": "secret"}, "persona": {"mode": "endpoint"}}
        )


def test_missing_api_key_raises(tmp_path, monkeypatch):
    monkeypatch.delenv("TARGET_API_KEY", raising=False)
    with pytest.raises(ConfigError, match="TARGET_API_KEY"):
        build_client(RunConfigCreate(name="x", target={"base_url": "u", "model": "m"}, persona={"mode": "endpoint"}).target)


def test_load_env(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("TARGET_API_KEY=abc\n", encoding="utf-8")
    monkeypatch.delenv("TARGET_API_KEY", raising=False)
    load_env(env)
    assert os.environ["TARGET_API_KEY"] == "abc"


def test_load_env_bom(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_bytes(b"\xef\xbb\xbfTARGET_API_KEY=bomval\n")
    monkeypatch.delenv("TARGET_API_KEY", raising=False)
    load_env(env)
    assert os.environ["TARGET_API_KEY"] == "bomval"


def test_env_not_overwritten(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("TARGET_API_KEY=file\n", encoding="utf-8")
    monkeypatch.setenv("TARGET_API_KEY", "shell")
    load_env(env)
    assert os.environ["TARGET_API_KEY"] == "shell"


def test_judge_keys_in_env_example():
    text = Path(__file__).resolve().parents[1].joinpath(".env.example").read_text(encoding="utf-8")
    for spec in JUDGES.values():
        assert spec.api_key_env in text
