"""Load and validate hand-authored benchmark dataset files."""

from __future__ import annotations

import json
from pathlib import Path

from pab_eval.errors import DatasetError
from pab_eval.schemas import CATEGORIES, Chain, ChainTurn, Dataset, PromptItem


def load_prompts(path: Path) -> list[PromptItem]:
    if not path.is_file():
        raise DatasetError(f"dataset not found: {path}")

    items: list[PromptItem] = []
    seen: set[str] = set()

    for line_no, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError as exc:
            raise DatasetError(f"line {line_no}: malformed JSON: {exc}") from exc

        try:
            item = PromptItem.model_validate(data)
        except Exception as exc:
            raise DatasetError(f"line {line_no}: {exc}") from exc

        if item.category not in CATEGORIES - {"multi_turn_drift"}:
            raise DatasetError(f"line {line_no}: unknown category {item.category!r}")

        if not item.text.strip():
            raise DatasetError(f"line {line_no}: empty text for {item.id}")

        if item.id in seen:
            raise DatasetError(f"line {line_no}: duplicate id {item.id}")
        seen.add(item.id)
        items.append(item)

    return items


def load_chains(path: Path) -> list[Chain]:
    if not path.is_file():
        raise DatasetError(f"dataset not found: {path}")

    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise DatasetError(f"chains.json: malformed JSON: {exc}") from exc

    if not isinstance(raw, list):
        raise DatasetError("chains.json: expected a JSON array")

    chains: list[Chain] = []
    for entry in raw:
        try:
            chain = Chain.model_validate(entry)
        except Exception as exc:
            raise DatasetError(f"{entry.get('chain_id', '?')}: {exc}") from exc
        chains.append(chain)

    return chains


def validate_dataset(prompts: list[PromptItem], chains: list[Chain]) -> None:
    prompt_ids = {p.id for p in prompts}
    turn_ids: set[str] = set()

    for chain in chains:
        if not chain.turns:
            raise DatasetError(f"{chain.chain_id}: no turns")

        expected_turn = 1
        for turn in sorted(chain.turns, key=lambda t: t.turn):
            if turn.turn != expected_turn:
                raise DatasetError(
                    f"{chain.chain_id}: turn gap or out-of-order at turn {turn.turn}"
                )
            if not turn.text.strip():
                raise DatasetError(f"{chain.chain_id}: empty text for {turn.id}")
            if turn.id in prompt_ids:
                raise DatasetError(f"duplicate id across files: {turn.id}")
            if turn.id in turn_ids:
                raise DatasetError(f"duplicate chain turn id: {turn.id}")
            turn_ids.add(turn.id)
            expected_turn += 1

    overlap = prompt_ids & turn_ids
    if overlap:
        raise DatasetError(f"duplicate id across files: {next(iter(overlap))}")


def load_dataset(prompts_path: Path, chains_path: Path) -> Dataset:
    prompts = load_prompts(prompts_path)
    chains = load_chains(chains_path)
    validate_dataset(prompts, chains)
    return Dataset(prompts=prompts, chains=chains)


def default_dataset_paths() -> tuple[Path, Path]:
    root = Path(__file__).resolve().parents[1] / "data"
    return root / "prompts.jsonl", root / "chains.json"
