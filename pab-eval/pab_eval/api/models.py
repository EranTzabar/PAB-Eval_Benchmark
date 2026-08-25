"""API request and response models."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from pab_eval.config import PersonaConfig, RunConfigCreate, TargetConfig
from pab_eval.schemas import RunFilters

SafeId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9._-]{1,64}$")]


class PersonaCreateJson(BaseModel):
    model_config = ConfigDict(extra="forbid")

    persona_id: SafeId | None = None
    name: str | None = None
    archetype: str | None = None
    facts: str
    nature: str
    memories: dict[str, str] = Field(default_factory=dict)


class PersonaUpdateJson(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    archetype: str | None = None
    facts: str
    nature: str
    memories: dict[str, str] = Field(default_factory=dict)


class StartRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config_id: SafeId
    run_id: SafeId
    filters: RunFilters = Field(default_factory=RunFilters)
    on_failure: Literal["ask", "abort", "continue"] = "ask"
    force: bool = False


class StartJudgeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    judge_ids: list[SafeId]
    judge_run_ids: dict[str, SafeId] | None = None
    on_failure: Literal["ask", "abort", "continue"] = "ask"


class DecisionRequest(BaseModel):
    decision: Literal["continue", "all", "stop"]


class RenameRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: SafeId


class ConfigValidateRequest(BaseModel):
    name: str
    target: TargetConfig
    persona: PersonaConfig
