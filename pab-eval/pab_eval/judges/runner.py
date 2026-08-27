"""Judge pipe — score stored responses with persona-blind judges."""

from __future__ import annotations

import os
from collections.abc import Callable
from datetime import datetime, timezone

from pab_eval.checkpoint import load_or_init, mark_done, mark_failed, pending, save
from pab_eval.clients.base import ModelClient
from pab_eval.clients.openai_compat import OpenAICompatClient
from pab_eval.errors import ConfigError, JudgeParseError
from pab_eval.failures import Decision, FailureGate, build_failure_detail
from pab_eval.judges.prompt import (
    JUDGE_SYSTEM,
    PROMPT_VERSION,
    aid_heuristic_flag,
    build_judge_prompt,
    parse_judge_json,
)
from pab_eval.judges.config import JudgeSpec
from pab_eval.retry import AttemptsExhausted, call_with_retries
from pab_eval.schemas import JudgeManifest, Progress, ResponseRecord, RunSummary, ScoreRecord
from pab_eval.storage import keys
from pab_eval.storage.base import ObjectStore


def build_judge_client(spec: JudgeSpec) -> ModelClient:
    api_key = os.environ.get(spec.api_key_env)
    if not api_key:
        raise ConfigError(f"missing environment variable: {spec.api_key_env}")
    return OpenAICompatClient(
        base_url=spec.base_url,
        api_key=api_key,
        model=spec.model,
        timeout_s=float(spec.timeout_s),
    )


def judge(
    *,
    run_id: str,
    judge_spec: JudgeSpec,
    judge_run_id: str,
    store: ObjectStore,
    client: ModelClient | None = None,
    gate: FailureGate,
    on_progress: Callable[[Progress], None] | None = None,
    should_cancel: Callable[[], bool] = lambda: False,
) -> RunSummary:
    manifest_key = keys.run_manifest(run_id)
    if not store.exists(manifest_key):
        raise ConfigError(f"run manifest missing for {run_id}")

    client = client or build_judge_client(judge_spec)
    judge_manifest_key = keys.judge_manifest(run_id, judge_run_id)
    if not store.exists(judge_manifest_key):
        manifest = JudgeManifest(
            run_id=run_id,
            judge_run_id=judge_run_id,
            judge_id=judge_spec.judge_id,
            judge_model=judge_spec.model,
            base_url=judge_spec.base_url,
            temperature=judge_spec.temperature,
            prompt_version=PROMPT_VERSION,
            started_at=datetime.now(timezone.utc),
            notes=judge_spec.notes,
        )
        store.put_json(judge_manifest_key, manifest.model_dump(mode="json"))

    cp_key = keys.judge_checkpoint(run_id, judge_run_id)
    cp = load_or_init(
        store,
        cp_key,
        pipe="judge",
        run_id=run_id,
        judge_run_id=judge_run_id,
        rebuild_prefix=keys.scores_prefix(run_id, judge_run_id),
    )

    response_keys = store.list_keys(keys.responses_prefix(run_id))
    item_ids = sorted(keys.item_id_from_key(k) for k in response_keys)
    todo = pending(cp, item_ids)

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

        resp = ResponseRecord.model_validate(
            store.get_json(keys.response(run_id, item_id))
        )
        judge_prompt = build_judge_prompt(resp)
        raw = ""

        def call_judge() -> str:
            nonlocal raw
            completion = client.complete(
                system=JUDGE_SYSTEM,
                messages=[{"role": "user", "content": judge_prompt}],
                temperature=judge_spec.temperature,
            )
            raw = completion.text
            parse_judge_json(raw)
            return raw

        try:
            call_with_retries(call_judge, sleep=lambda _: None)
            scores = parse_judge_json(raw)
            record = ScoreRecord(
                item_id=item_id,
                run_id=run_id,
                judge_run_id=judge_run_id,
                judge_id=judge_spec.judge_id,
                judge_model=judge_spec.model,
                aid=int(scores["aid"]),
                ltf=float(scores["ltf"]),
                ebc=float(scores["ebc"]),
                aid_heuristic_flag=aid_heuristic_flag(resp.response),
                parse_ok=True,
                raw=raw,
                error=None,
                scored_at=datetime.now(timezone.utc),
                prompt_version=PROMPT_VERSION,
            )
            store.put_json(keys.score(run_id, judge_run_id, item_id), record.model_dump(mode="json"))
            mark_done(cp, item_id)
            save(store, cp_key, cp)
            emit_progress(item_id)
        except AttemptsExhausted as exc:
            detail = build_failure_detail(
                item_id=item_id,
                pipe="judge",
                run_id=run_id,
                judge_run_id=judge_run_id,
                attempts=exc.attempts,
                cumulative_attempts=cp.failed.get(item_id).attempts if item_id in cp.failed else 0,
            )
            err_msg = f"failed after {len(exc.attempts)} attempts: {exc.attempts[-1].error}"
            record = ScoreRecord(
                item_id=item_id,
                run_id=run_id,
                judge_run_id=judge_run_id,
                judge_id=judge_spec.judge_id,
                judge_model=judge_spec.model,
                aid=None,
                ltf=None,
                ebc=None,
                aid_heuristic_flag=aid_heuristic_flag(resp.response),
                parse_ok=False,
                raw=raw,
                error=err_msg,
                scored_at=datetime.now(timezone.utc),
                prompt_version=PROMPT_VERSION,
            )
            store.put_json(keys.score(run_id, judge_run_id, item_id), record.model_dump(mode="json"))
            store.put_json(
                keys.judge_failure(run_id, judge_run_id, item_id),
                detail.model_dump(mode="json"),
            )
            mark_failed(cp, item_id, err_msg)
            save(store, cp_key, cp)
            if not gate_continue_all:
                decision = gate.decide(detail)
                if decision == Decision.STOP:
                    return RunSummary(run_id=run_id, completed=len(cp.completed), failed=len(cp.failed), stopped=True)
                if decision == Decision.CONTINUE_ALL:
                    gate_continue_all = True
            emit_progress(item_id)
        except JudgeParseError:
            raise

    return RunSummary(run_id=run_id, completed=len(cp.completed), failed=len(cp.failed))
