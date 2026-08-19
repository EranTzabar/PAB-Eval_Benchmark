"""Run configuration, env loading, and client factory."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field, model_validator

from pab_eval.clients.openai_compat import OpenAICompatClient
from pab_eval.errors import ConfigError
from pab_eval.storage.base import ObjectStore

TARGET_API_KEY_ENV = "TARGET_API_KEY"


def load_env(explicit_path: Path | None = None) -> None:
    if explicit_path is None:
        path = Path(__file__).resolve().parents[1] / ".env"
    else:
        path = explicit_path
    if path.is_file():
        load_dotenv(path, encoding="utf-8-sig", override=False)


class TargetConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str
    model: str
    temperature: float = 0.7
    timeout_s: int = 120


class PersonaConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["harness", "endpoint"] = "harness"
    name: str | None = None
    archetype: str | None = None
    wrapper: Literal["minimal", "strict", "none"] = "minimal"
    system_prompt: str | None = None
    persona_id: str | None = None

    @model_validator(mode="after")
    def validate_persona_sources(self) -> PersonaConfig:
        has_prompt = bool(self.system_prompt)
        has_persona = bool(self.persona_id)

        if self.mode == "endpoint":
            if has_prompt or has_persona:
                raise ValueError(
                    "endpoint mode must not set system_prompt or persona_id"
                )
            return self

        if has_prompt and has_persona:
            raise ValueError("harness mode requires exactly one of system_prompt or persona_id, not both")
        if not has_prompt and not has_persona:
            raise ValueError("harness mode requires exactly one of system_prompt or persona_id")
        if has_prompt and self.wrapper != "minimal":
            raise ValueError("wrapper is only meaningful with persona_id")
        return self


class RunConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config_id: str
    name: str
    target: TargetConfig
    persona: PersonaConfig
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_fields(cls, data: object) -> object:
        if isinstance(data, dict):
            legacy = {
                "api_key": f"set {TARGET_API_KEY_ENV} in .env instead",
                "prompt_file": "use persona.system_prompt or persona.persona_id",
                "persona_dir": "use persona.persona_id with an uploaded persona pack",
            }
            for key, msg in legacy.items():
                if key in data:
                    raise ValueError(f"{key} is not supported: {msg}")
        return data


class RunConfigCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    target: TargetConfig
    persona: PersonaConfig

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_fields(cls, data: object) -> object:
        return RunConfig.reject_legacy_fields(data)


def build_client(target: TargetConfig) -> OpenAICompatClient:
    api_key = os.environ.get(TARGET_API_KEY_ENV)
    if not api_key:
        raise ConfigError(f"missing environment variable: {TARGET_API_KEY_ENV}")
    return OpenAICompatClient(
        base_url=target.base_url,
        api_key=api_key,
        model=target.model,
        timeout_s=float(target.timeout_s),
    )


def resolve_persona(config: RunConfig, store: ObjectStore) -> str | None:
    if config.persona.mode == "endpoint":
        return None
    if config.persona.system_prompt:
        return config.persona.system_prompt

    from pab_eval.persona import R2PersonaSource, compose_persona

    source = R2PersonaSource(store, config.persona.persona_id or "")
    return compose_persona(
        source,
        wrapper=config.persona.wrapper,
        name=config.persona.name,
    )


def env_status(required_vars: list[str]) -> dict[str, bool]:
    return {name: bool(os.environ.get(name)) for name in required_vars}
