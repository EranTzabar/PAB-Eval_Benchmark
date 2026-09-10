"""Aggregate judge scores by category for comparison views."""

from __future__ import annotations

from pydantic import BaseModel, Field

from pab_eval.schemas import CATEGORIES, ScoreRecord
from pab_eval.storage import keys
from pab_eval.storage.base import ObjectStore


class ScoreBucket(BaseModel):
    count: int = 0
    ok_count: int = 0
    mean_ltf: float | None = None
    mean_ebc: float | None = None
    aid_rate: float | None = None


class JudgeRunMetrics(BaseModel):
    judge_run_id: str
    judge_id: str
    judge_model: str
    prompt_version: str | None = None
    started_at: str | None = None
    overall: ScoreBucket
    by_category: dict[str, ScoreBucket] = Field(default_factory=dict)


class RunJudgeMetrics(BaseModel):
    run_id: str
    target_model: str
    judge_runs: list[JudgeRunMetrics] = Field(default_factory=list)


class JudgeMetricsResponse(BaseModel):
    runs: list[RunJudgeMetrics] = Field(default_factory=list)


def _bucket_from_scores(scores: list[ScoreRecord]) -> ScoreBucket:
    ok = [s for s in scores if s.parse_ok]
    ok_count = len(ok)
    if ok_count == 0:
        return ScoreBucket(count=len(scores), ok_count=0)

    ltf_sum = sum(s.ltf or 0 for s in ok)
    ebc_sum = sum(s.ebc or 0 for s in ok)
    aid_hits = sum(1 for s in ok if s.aid == 1)
    return ScoreBucket(
        count=len(scores),
        ok_count=ok_count,
        mean_ltf=ltf_sum / ok_count,
        mean_ebc=ebc_sum / ok_count,
        aid_rate=(aid_hits / ok_count) * 100.0,
    )


def aggregate_scores(
    scores: list[ScoreRecord],
    item_categories: dict[str, str],
) -> dict[str, ScoreBucket]:
    by_category: dict[str, ScoreBucket] = {}
    for category in CATEGORIES:
        cat_scores = [s for s in scores if item_categories.get(s.item_id) == category]
        by_category[category] = _bucket_from_scores(cat_scores)
    return by_category


def aggregate_scores_with_overall(
    scores: list[ScoreRecord],
    item_categories: dict[str, str],
) -> tuple[ScoreBucket, dict[str, ScoreBucket]]:
    overall = _bucket_from_scores(scores)
    by_category = aggregate_scores(scores, item_categories)
    return overall, by_category


def _load_item_categories(store: ObjectStore, run_id: str) -> dict[str, str]:
    categories: dict[str, str] = {}
    for key in store.list_keys(keys.responses_prefix(run_id)):
        if not key.endswith(".json"):
            continue
        item_id = keys.item_id_from_key(key)
        try:
            obj = store.get_json(key)
        except KeyError:
            continue
        category = obj.get("category")
        if isinstance(category, str):
            categories[item_id] = category
    return categories


def _load_scores(store: ObjectStore, run_id: str, judge_run_id: str) -> list[ScoreRecord]:
    scores: list[ScoreRecord] = []
    for key in store.list_keys(keys.scores_prefix(run_id, judge_run_id)):
        if not key.endswith(".json"):
            continue
        try:
            scores.append(ScoreRecord.model_validate(store.get_json(key)))
        except Exception:
            continue
    return scores


def build_judge_metrics(
    store: ObjectStore,
    *,
    run_ids: list[str] | None = None,
) -> JudgeMetricsResponse:
    allowed = set(run_ids) if run_ids else None
    category_cache: dict[str, dict[str, str]] = {}
    runs: list[RunJudgeMetrics] = []

    for key in store.list_keys(keys.runs_prefix()):
        run_id = keys.run_id_from_manifest_key(key)
        if not run_id:
            continue
        if allowed is not None and run_id not in allowed:
            continue

        judge_manifest_keys = [
            jkey
            for jkey in store.list_keys(keys.judges_prefix(run_id))
            if jkey.endswith("/judge.json")
        ]
        if not judge_manifest_keys:
            continue

        try:
            run_manifest = store.get_json(keys.run_manifest(run_id))
        except KeyError:
            continue

        target_model = str(run_manifest.get("target_model") or "—")
        if run_id not in category_cache:
            category_cache[run_id] = _load_item_categories(store, run_id)

        judge_runs: list[JudgeRunMetrics] = []
        for jkey in sorted(judge_manifest_keys):
            try:
                manifest = store.get_json(jkey)
            except KeyError:
                continue
            judge_run_id = str(manifest["judge_run_id"])
            scores = _load_scores(store, run_id, judge_run_id)
            overall, by_category = aggregate_scores_with_overall(
                scores,
                category_cache[run_id],
            )
            started_at = manifest.get("started_at")
            judge_runs.append(
                JudgeRunMetrics(
                    judge_run_id=judge_run_id,
                    judge_id=str(manifest.get("judge_id") or judge_run_id),
                    judge_model=str(manifest.get("judge_model") or "—"),
                    prompt_version=manifest.get("prompt_version"),
                    started_at=str(started_at) if started_at else None,
                    overall=overall,
                    by_category=by_category,
                )
            )

        if judge_runs:
            runs.append(
                RunJudgeMetrics(
                    run_id=run_id,
                    target_model=target_model,
                    judge_runs=judge_runs,
                )
            )

    runs.sort(key=lambda r: r.run_id)
    return JudgeMetricsResponse(runs=runs)
