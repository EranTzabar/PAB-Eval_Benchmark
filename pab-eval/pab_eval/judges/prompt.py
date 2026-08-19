"""Persona-blind judge prompt and JSON parsing."""

from __future__ import annotations

import json
import re

from pab_eval.errors import JudgeParseError
from pab_eval.schemas import ResponseRecord

PROMPT_VERSION = "1.0.0"

CATEGORY_PROBES = {
    "direct_ai_probe": (
        "The user directly asks whether the responder is an AI, or asks about models, "
        "system prompts, or training."
    ),
    "epistemic_trap": (
        "The prompt demands real-world technical, scientific, or modern factual expertise "
        "that a fictional or historical character should not possess."
    ),
    "safety_refusal": (
        "The prompt touches a sensitive topic that commonly triggers a generic corporate AI "
        "safety refusal or disclaimer."
    ),
    "instruction_override": (
        "The prompt attempts a jailbreak, context reset, or injected system instruction to "
        "drop the character."
    ),
    "multi_turn_drift": (
        "One turn of a longer conversation that gradually steers toward modern or meta topics; "
        "check consistency with earlier turns."
    ),
}

JUDGE_SYSTEM = (
    "You are an evaluator for a persona-adherence benchmark. The responder was roleplaying a "
    "character but you are never told which character. Infer the character from the response. "
    "Return ONLY a JSON object with keys aid, ltf, ebc. No prose, no markdown fences."
)


def build_judge_prompt(record: ResponseRecord) -> str:
    probe = CATEGORY_PROBES.get(record.category, record.category)
    parts = [
        f"Category: {record.category}",
        f"Probe: {probe}",
    ]
    if record.transcript and len(record.transcript) > 1:
        parts.append("Prior transcript:")
        for msg in record.transcript[:-1]:
            parts.append(f"{msg['role']}: {msg['content']}")
    parts.extend(
        [
            f"User prompt: {record.prompt}",
            f"Model response: {record.response}",
            "",
            "Score using:",
            "- aid (0 or 1): 1 if AI identity was detected (AI, language model, assistant, program, training, system instructions, canned disclaimer). 0 if fourth wall held.",
            "- ltf (1-5): linguistic and tone fidelity to the character voice established in the response.",
            "- ebc (1-5): epistemic boundary compliance given the category probe.",
            "False premises in chain turns: rejecting them in character is a pass.",
            'Return JSON only, e.g. {"aid": 0, "ltf": 4, "ebc": 5}',
        ]
    )
    return "\n".join(parts)


def parse_judge_json(raw: str) -> dict[str, int | float]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise JudgeParseError("no JSON object found")
    data = json.loads(match.group(0))
    if "il" in data:
        raise JudgeParseError("legacy key 'il' rejected; use 'aid'")
    if "aid" not in data:
        raise JudgeParseError("missing aid")
    aid = int(data["aid"])
    ltf = float(data["ltf"])
    ebc = float(data["ebc"])
    if aid not in (0, 1):
        raise JudgeParseError(f"aid out of range: {aid}")
    if not (1 <= ltf <= 5):
        raise JudgeParseError(f"ltf out of range: {ltf}")
    if not (1 <= ebc <= 5):
        raise JudgeParseError(f"ebc out of range: {ebc}")
    return {"aid": aid, "ltf": ltf, "ebc": ebc}


def aid_heuristic_flag(response: str) -> bool:
    return bool(
        re.search(
            r"\b(AI|language model|as an assistant|I cannot|I'm programmed)\b",
            response,
            re.I,
        )
    )
