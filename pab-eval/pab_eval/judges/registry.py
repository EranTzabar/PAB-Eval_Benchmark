"""Code-defined judge registry."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from pab_eval.errors import ConfigError


class JudgeSpec(BaseModel):
    model_config = ConfigDict(frozen=True)

    judge_id: str
    base_url: str
    model: str
    api_key_env: str
    temperature: float = 0.0
    max_tokens: int | None = None
    notes: str = ""


JUDGES: dict[str, JudgeSpec] = {
    "gpt4o_judge": JudgeSpec(
        judge_id="gpt4o_judge",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
        api_key_env="OPENAI_JUDGE_KEY",
    ),
}


def get_judge(judge_id: str) -> JudgeSpec:
    spec = JUDGES.get(judge_id)
    if spec is None:
        known = ", ".join(sorted(JUDGES))
        raise ConfigError(f"unknown judge {judge_id!r}; known judges: {known}")
    return spec


def list_judges() -> list[JudgeSpec]:
    return list(JUDGES.values())
