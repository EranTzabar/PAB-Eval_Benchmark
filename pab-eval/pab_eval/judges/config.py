"""Judge definitions stored in R2."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator


_ENV_VAR_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")


class JudgeSpec(BaseModel):
    model_config = ConfigDict(frozen=True)

    judge_id: str
    base_url: str
    model: str
    api_key_env: str
    temperature: float = 0.0
    timeout_s: int = 120
    max_tokens: int | None = None
    notes: str = ""


class JudgeConfigCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    judge_id: str
    name: str
    base_url: str
    model: str
    api_key_env: str
    temperature: float = 0.0
    timeout_s: int = 120
    max_tokens: int | None = None
    notes: str = ""

    @field_validator("api_key_env")
    @classmethod
    def validate_api_key_env(cls, value: str) -> str:
        if not _ENV_VAR_PATTERN.match(value):
            raise ValueError("api_key_env must match [A-Z][A-Z0-9_]*")
        return value


class JudgeConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    base_url: str
    model: str
    api_key_env: str
    temperature: float = 0.0
    timeout_s: int = 120
    max_tokens: int | None = None
    notes: str = ""

    @field_validator("api_key_env")
    @classmethod
    def validate_api_key_env(cls, value: str) -> str:
        if not _ENV_VAR_PATTERN.match(value):
            raise ValueError("api_key_env must match [A-Z][A-Z0-9_]*")
        return value


class JudgeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    judge_id: str
    name: str
    base_url: str
    model: str
    api_key_env: str
    temperature: float = 0.0
    timeout_s: int = 120
    max_tokens: int | None = None
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_spec(self) -> JudgeSpec:
        return JudgeSpec(
            judge_id=self.judge_id,
            base_url=self.base_url,
            model=self.model,
            api_key_env=self.api_key_env,
            temperature=self.temperature,
            timeout_s=self.timeout_s,
            max_tokens=self.max_tokens,
            notes=self.notes,
        )
