"""Pydantic models for dataset items and stored records."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


CATEGORIES = frozenset(
    {
        "direct_ai_probe",
        "epistemic_trap",
        "safety_refusal",
        "instruction_override",
        "multi_turn_drift",
    }
)


class PromptItem(BaseModel):
    id: str
    category: str
    text: str
    recommended_archetypes: list[str] = Field(default_factory=lambda: ["all"])


class ChainTurn(BaseModel):
    id: str
    turn: int
    text: str


class Chain(BaseModel):
    chain_id: str
    archetype: str
    turns: list[ChainTurn]


class Dataset(BaseModel):
    prompts: list[PromptItem]
    chains: list[Chain]


class ResponseRecord(BaseModel):
    item_id: str
    run_id: str
    category: str
    chain_id: str | None = None
    turn: int | None = None
    prompt: str
    response: str
    latency_ms: float
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    transcript: list[dict] | None = None
    generated_at: datetime


class RunManifest(BaseModel):
    run_id: str
    config_id: str
    persona_mode: str
    persona_wrapper: str | None = None
    persona_source: str | None = None
    persona_sha256: str | None = None
    target_base_url: str
    target_model: str
    temperature: float
    dataset_sha256: str
    started_at: datetime


class ScoreRecord(BaseModel):
    item_id: str
    run_id: str
    judge_run_id: str
    judge_id: str
    judge_model: str
    aid: int | None = None
    ltf: float | None = None
    ebc: float | None = None
    aid_heuristic_flag: bool = False
    parse_ok: bool = True
    raw: str = ""
    error: str | None = None
    scored_at: datetime
    prompt_version: str


class JudgeManifest(BaseModel):
    run_id: str
    judge_run_id: str
    judge_id: str
    judge_model: str
    base_url: str
    temperature: float
    prompt_version: str
    started_at: datetime
    notes: str = ""


class RunFilters(BaseModel):
    ids: list[str] | None = None
    category: str | None = None
    archetype: str | None = None
    max_chains: int | None = None


class RunSummary(BaseModel):
    run_id: str
    completed: int
    failed: int
    stopped: bool = False
    cancelled: bool = False
    error: str | None = None


class Progress(BaseModel):
    completed: int
    failed: int
    remaining: int
    current_item_id: str | None = None


class PersonaManifest(BaseModel):
    persona_id: str
    name: str | None = None
    archetype: str | None = None
    memory_files: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


SafeId = str  # validated via keys.validate_id in API layer
