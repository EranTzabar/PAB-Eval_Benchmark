"""Load judge score records from object storage."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor


def all_score_keys(store, run_id: str, judge_run_id: str) -> list[str]:
    from pab_eval.storage import keys

    prefix = keys.scores_prefix(run_id, judge_run_id)
    found: list[str] = []
    start_after: str | None = None
    while True:
        page, has_more = store.list_keys_page(prefix, limit=500, start_after=start_after)
        if not page:
            break
        found.extend(page)
        if not has_more:
            break
        start_after = page[-1]
    return found


def load_score_jsons_parallel(store, score_keys: list[str], *, max_workers: int = 32) -> list[dict]:
    if not score_keys:
        return []

    def load_one(key: str) -> dict | None:
        try:
            return store.get_json(key)
        except KeyError:
            return None

    workers = min(max_workers, max(1, len(score_keys)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        loaded = list(pool.map(load_one, score_keys))
    return [item for item in loaded if item is not None]


def load_all_scores(store, run_id: str, judge_run_id: str) -> list[dict]:
    score_keys = all_score_keys(store, run_id, judge_run_id)
    items = load_score_jsons_parallel(store, score_keys)
    items.sort(key=lambda obj: str(obj.get("item_id") or ""))
    return items
