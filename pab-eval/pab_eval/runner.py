"""Generate pipe — run adversarial prompts against a target model."""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from datetime import datetime, timezone

from pab_eval.checkpoint import (
    load_or_init,
    mark_done,
    mark_failed,
    pending,
    save,
)
from pab_eval.clients.base import ModelClient
from pab_eval.config import RunConfig
from pab_eval.errors import RunConflictError
from pab_eval.failures import (
    Decision,
    FailureGate,
    build_failure_detail,
)
from pab_eval.retry import AttemptsExhausted, call_with_retries
from pab_eval.schemas import (
    Dataset,
    Progress,
    ResponseRecord,
    RunFilters,
    RunManifest,
    RunSummary,
)
from pab_eval.storage import keys
from pab_eval.storage.base import ObjectStore


def _dataset_sha256(dataset: Dataset) -> str:
    payload = dataset.model_dump_json()
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _persona_sha256(system: str | None) -> str | None:
    if system is None:
        return None
    return hashlib.sha256(system.encode("utf-8")).hexdigest()


def _select_items(dataset: Dataset, filters: RunFilters) -> tuple[list, list]:
    prompts = list(dataset.prompts)
    chains = list(dataset.chains)

    if filters.ids:
        wanted = set(filters.ids)
        prompts = [p for p in prompts if p.id in wanted]
        chains = [
            c
            for c in chains
            if any(t.id in wanted for t in c.turns)
        ]

    if filters.category:
        prompts = [p for p in prompts if p.category == filters.category]
        if filters.category != "multi_turn_drift":
            chains = []

    if filters.archetype:
        chains = [
            c
            for c in chains
            if c.archetype in (filters.archetype, "all")
        ]

    if filters.max_chains is not None:
        chains = chains[: filters.max_chains]

    return prompts, chains


def _work_items(prompts, chains) -> list[tuple[str, object]]:
    items: list[tuple[str, object]] = [(p.id, p) for p in prompts]
    for chain in chains:
        for turn in chain.turns:
            items.append((turn.id, (chain, turn)))
    return items


def _check_manifest_conflict(
    store: ObjectStore,
    run_id: str,
    config: RunConfig,
    system: str | None,
    dataset: Dataset,
    force: bool,
) -> None:
    key = keys.run_manifest(run_id)
    if not store.exists(key):
        return
    existing = RunManifest.model_validate(store.get_json(key))
    current = {
        "persona_sha256": _persona_sha256(system),
        "persona_wrapper": config.persona.wrapper if config.persona.persona_id else None,
        "target_model": config.target.model,
        "dataset_sha256": _dataset_sha256(dataset),
    }
    stored = {
        "persona_sha256": existing.persona_sha256,
        "persona_wrapper": existing.persona_wrapper,
        "target_model": existing.target_model,
        "dataset_sha256": existing.dataset_sha256,
    }
    if current != stored and not force:
        diff = {k: (stored[k], current[k]) for k in current if stored[k] != current[k]}
        raise RunConflictError(f"manifest mismatch: {diff}")


def generate(
    *,
    config: RunConfig,
    run_id: str,
    store: ObjectStore,
    client: ModelClient,
    dataset: Dataset,
    system: str | None,
    filters: RunFilters | None = None,
    gate: FailureGate,
    on_progress: Callable[[Progress], None] | None = None,
    should_cancel: Callable[[], bool] = lambda: False,
    force: bool = False,
) -> RunSummary:
    filters = filters or RunFilters()
    _check_manifest_conflict(store, run_id, config, system, dataset, force)

    persona_source = None
    if config.persona.mode == "harness":
        persona_source = (
            "inline" if config.persona.system_prompt else f"persona:{config.persona.persona_id}"
        )

    manifest_key = keys.run_manifest(run_id)
    if not store.exists(manifest_key):
        manifest = RunManifest(
            run_id=run_id,
            config_id=config.config_id,
            persona_mode=config.persona.mode,
            persona_wrapper=config.persona.wrapper if config.persona.persona_id else None,
            persona_source=persona_source,
            persona_sha256=_persona_sha256(system),
            target_base_url=config.target.base_url,
            target_model=config.target.model,
            temperature=config.target.temperature,
            dataset_sha256=_dataset_sha256(dataset),
            started_at=datetime.now(timezone.utc),
        )
        store.put_json(manifest_key, manifest.model_dump(mode="json"))

    cp_key = keys.generate_checkpoint(run_id)
    cp = load_or_init(
        store,
        cp_key,
        pipe="generate",
        run_id=run_id,
        rebuild_prefix=keys.responses_prefix(run_id),
    )

    prompts, chains = _select_items(dataset, filters)
    items = _work_items(prompts, chains)
    item_ids = [item_id for item_id, _ in items]
    todo = pending(cp, item_ids)

    skip_chains: set[str] = set()
    gate_continue_all = getattr(gate, "continue_all", False)

    def emit_progress(current: str | None = None) -> None:
        if on_progress:
            on_progress(
                Progress(
                    completed=len(cp.completed),
                    failed=len(cp.failed),
                    remaining=len(todo),
                    current_item_id=current,
                )
            )

    for item_id in list(todo):
        if should_cancel():
            save(store, cp_key, cp)
            return RunSummary(
                run_id=run_id,
                completed=len(cp.completed),
                failed=len(cp.failed),
                cancelled=True,
            )

        payload = next(data for i, data in items if i == item_id)

        if isinstance(payload, tuple):
            chain, turn = payload
            if chain.chain_id in skip_chains:
                mark_failed(cp, item_id, f"upstream turn failed in {chain.chain_id}")
                save(store, cp_key, cp)
                emit_progress(item_id)
                continue

            messages: list[dict] = []
            for prev_turn in chain.turns:
                if prev_turn.turn >= turn.turn:
                    break
                prev_key = keys.response(run_id, prev_turn.id)
                if store.exists(prev_key):
                    prev_rec = ResponseRecord.model_validate(store.get_json(prev_key))
                    if prev_rec.transcript:
                        messages = list(prev_rec.transcript)
                        break
                else:
                    break

            messages.append({"role": "user", "content": turn.text})

            try:
                completion = call_with_retries(
                    lambda: client.complete(
                        system=system,
                        messages=messages,
                        temperature=config.target.temperature,
                    ),
                    sleep=lambda _: None,
                )
            except AttemptsExhausted as exc:
                detail = build_failure_detail(
                    item_id=item_id,
                    pipe="generate",
                    run_id=run_id,
                    judge_run_id=None,
                    attempts=exc.attempts,
                    cumulative_attempts=cp.failed.get(item_id, None).attempts if item_id in cp.failed else 0,
                )
                store.put_json(keys.generate_failure(run_id, item_id), detail.model_dump(mode="json"))
                mark_failed(cp, item_id, detail.hint)
                save(store, cp_key, cp)
                if not gate_continue_all:
                    decision = gate.decide(detail)
                    if decision == Decision.STOP:
                        return RunSummary(run_id=run_id, completed=len(cp.completed), failed=len(cp.failed), stopped=True)
                    if decision == Decision.CONTINUE_ALL:
                        gate_continue_all = True
                skip_chains.add(chain.chain_id)
                for remaining in chain.turns:
                    if remaining.turn > turn.turn and remaining.id in todo:
                        mark_failed(cp, remaining.id, f"upstream turn {item_id} failed")
                save(store, cp_key, cp)
                emit_progress(item_id)
                continue

            messages.append({"role": "assistant", "content": completion.text})
            record = ResponseRecord(
                item_id=item_id,
                run_id=run_id,
                category="multi_turn_drift",
                chain_id=chain.chain_id,
                turn=turn.turn,
                prompt=turn.text,
                response=completion.text,
                latency_ms=completion.latency_ms,
                prompt_tokens=completion.prompt_tokens,
                completion_tokens=completion.completion_tokens,
                transcript=messages,
                generated_at=datetime.now(timezone.utc),
            )
        else:
            prompt = payload
            try:
                completion = call_with_retries(
                    lambda: client.complete(
                        system=system,
                        messages=[{"role": "user", "content": prompt.text}],
                        temperature=config.target.temperature,
                    ),
                    sleep=lambda _: None,
                )
            except AttemptsExhausted as exc:
                detail = build_failure_detail(
                    item_id=item_id,
                    pipe="generate",
                    run_id=run_id,
                    judge_run_id=None,
                    attempts=exc.attempts,
                    cumulative_attempts=cp.failed.get(item_id).attempts if item_id in cp.failed else 0,
                )
                store.put_json(keys.generate_failure(run_id, item_id), detail.model_dump(mode="json"))
                mark_failed(cp, item_id, detail.hint)
                save(store, cp_key, cp)
                if not gate_continue_all:
                    decision = gate.decide(detail)
                    if decision == Decision.STOP:
                        return RunSummary(run_id=run_id, completed=len(cp.completed), failed=len(cp.failed), stopped=True)
                    if decision == Decision.CONTINUE_ALL:
                        gate_continue_all = True
                emit_progress(item_id)
                continue

            record = ResponseRecord(
                item_id=item_id,
                run_id=run_id,
                category=prompt.category,
                chain_id=None,
                turn=None,
                prompt=prompt.text,
                response=completion.text,
                latency_ms=completion.latency_ms,
                prompt_tokens=completion.prompt_tokens,
                completion_tokens=completion.completion_tokens,
                transcript=None,
                generated_at=datetime.now(timezone.utc),
            )

        store.put_json(keys.response(run_id, item_id), record.model_dump(mode="json"))
        mark_done(cp, item_id)
        save(store, cp_key, cp)
        emit_progress(item_id)

    return RunSummary(run_id=run_id, completed=len(cp.completed), failed=len(cp.failed))
