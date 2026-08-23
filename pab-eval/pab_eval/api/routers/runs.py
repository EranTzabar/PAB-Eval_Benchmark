"""Run control endpoints."""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Response
from sse_starlette.sse import EventSourceResponse

from pab_eval.api.deps import get_state
from pab_eval.api.models import DecisionRequest, RenameRunRequest, StartJudgeRequest, StartRunRequest
from pab_eval.api.stores import get_config
from pab_eval.config import build_client, resolve_persona
from pab_eval.dataset import default_dataset_paths, load_dataset
from pab_eval.errors import ConfigError, JobAlreadyRunningError, RunConflictError
from pab_eval.failures import Decision, FixedPolicyGate
from pab_eval.jobs.events import Event
from pab_eval.jobs.gate import ApiFailureGate
from pab_eval.jobs.manager import JobContext, JobState
from pab_eval.judges.registry import get_judge
from pab_eval.judges.runner import build_judge_client, judge as run_judge
from pab_eval.runner import generate
from pab_eval.schemas import Progress
from pab_eval.storage import keys
from pab_eval.storage.run_rename import plan_rename, rename_run
from pab_eval.dataset_view import patch_dataset_view_run_id

router = APIRouter(prefix="/runs", tags=["runs"])


def _rename_status_payload(op) -> dict:
    return {
        "old_run_id": op.old_run_id,
        "new_run_id": op.new_run_id,
        "status": op.status,
        "phase": op.phase,
        "copied": op.copied,
        "total": op.total,
        "skipped": op.skipped,
        "error": op.error,
    }


def _drop_rename_jobs(state, old_id: str, new_id: str) -> None:
    job_id = f"generate:{old_id}"
    state.jobs.drop(job_id)
    new_job_id = f"generate:{new_id}"
    if new_job_id != job_id:
        state.jobs.drop(new_job_id)


def _run_rename_background(state, old_id: str, new_id: str) -> None:
    tracker = state.rename_tracker

    def on_progress(phase: str, copied: int, total: int, skipped: int) -> None:
        if phase == "deleting":
            tracker.update(old_id, phase="deleting", copied=copied, skipped=skipped)
        elif phase == "done":
            tracker.update(old_id, phase="done", copied=copied, skipped=skipped)
        else:
            tracker.update(old_id, phase="copying", copied=copied, skipped=skipped)

    try:
        rename_run(state.store, old_id, new_id, on_progress=on_progress)
        patch_dataset_view_run_id(state.store, old_id, new_id)
        _drop_rename_jobs(state, old_id, new_id)
        tracker.complete(old_id)
    except Exception as exc:
        tracker.fail(old_id, f"{exc.__class__.__name__}: {exc}")


def _gate_for_request(on_failure: str, job, bus, cancel_event):
    if on_failure == "ask":
        return ApiFailureGate(job, bus, cancel_event)
    return FixedPolicyGate("abort" if on_failure == "abort" else "continue")


@router.post("", status_code=202)
def start_run(body: StartRunRequest):
    state = get_state()
    job_id = f"generate:{body.run_id}"
    try:
        config = get_config(state.store, body.config_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="config not found") from None

    prompts_path, chains_path = default_dataset_paths()
    if not prompts_path.is_file():
        raise HTTPException(status_code=503, detail="dataset not found")
    dataset = load_dataset(prompts_path, chains_path)

    def work(ctx: JobContext):
        job = ctx.job
        gate = _gate_for_request(body.on_failure, job, state.bus, ctx.cancel_event)
        ctx.gate = gate

        def on_progress(p: Progress) -> None:
            job.progress = p
            state.bus.publish(Event(type="progress", job=job.model_copy(deep=True), at=datetime.now(timezone.utc)))

        try:
            system = resolve_persona(config, state.store)
            client = build_client(config.target)
        except ConfigError as exc:
            raise exc

        try:
            summary = generate(
                config=config,
                run_id=body.run_id,
                store=state.store,
                client=client,
                dataset=dataset,
                system=system,
                filters=body.filters,
                gate=gate,
                on_progress=on_progress,
                should_cancel=ctx.cancel_event.is_set,
                force=body.force,
            )
        except RunConflictError as exc:
            raise exc

        state.bus.publish(
            Event(type="finished", job=job.model_copy(deep=True), at=datetime.now(timezone.utc))
        )
        return summary

    try:
        job = state.jobs.start(job_id, "generate", body.run_id, work)
    except JobAlreadyRunningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return job


@router.get("")
def list_runs():
    state = get_state()
    run_ids: set[str] = set()
    for key in state.store.list_keys(keys.runs_prefix()):
        run_id = keys.run_id_from_manifest_key(key)
        if run_id:
            run_ids.add(run_id)
    for job in state.jobs.list():
        if job.kind == "generate":
            run_ids.add(job.run_id)
    out = []
    for run_id in sorted(run_ids):
        item = {"run_id": run_id}
        job = state.jobs.get(f"generate:{run_id}")
        if job:
            item["job"] = job
        if state.store.exists(keys.run_manifest(run_id)):
            item["manifest"] = state.store.get_json(keys.run_manifest(run_id))
        out.append(item)
    return out


@router.get("/judge-runs")
def list_all_judge_runs():
    state = get_state()
    items: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for key in state.store.list_keys(keys.runs_prefix()):
        run_id = keys.run_id_from_manifest_key(key)
        if not run_id:
            continue
        for jkey in state.store.list_keys(keys.judges_prefix(run_id)):
            if not jkey.endswith("/judge.json"):
                continue
            manifest = state.store.get_json(jkey)
            judge_run_id = manifest["judge_run_id"]
            seen.add((run_id, judge_run_id))
            item: dict = {
                "run_id": run_id,
                "judge_run_id": judge_run_id,
                "manifest": manifest,
            }
            job = state.jobs.get(f"judge:{run_id}:{judge_run_id}")
            if job:
                item["job"] = job
            else:
                item["progress"] = _judge_progress_from_checkpoint(state.store, run_id, judge_run_id)
            items.append(item)

    for job in state.jobs.list():
        if job.kind != "judge" or not job.judge_run_id:
            continue
        key = (job.run_id, job.judge_run_id)
        if key in seen:
            continue
        items.append(
            {
                "run_id": job.run_id,
                "judge_run_id": job.judge_run_id,
                "job": job,
            }
        )

    def _started_at(item: dict) -> str:
        manifest = item.get("manifest") or {}
        if manifest.get("started_at"):
            return str(manifest["started_at"])
        job = item.get("job")
        if job is not None:
            started = job.started_at
            return started.isoformat() if hasattr(started, "isoformat") else str(started)
        return ""

    items.sort(key=_started_at, reverse=True)
    return items


def _judge_progress_from_checkpoint(store, run_id: str, judge_run_id: str) -> dict:
    cp_key = keys.judge_checkpoint(run_id, judge_run_id)
    if not store.exists(cp_key):
        return {"completed": 0, "failed": 0, "remaining": 0, "current_item_id": None}
    cp = store.get_json(cp_key)
    completed = len(cp.get("completed", []))
    failed = len(cp.get("failed", {}))
    resp_count = len(store.list_keys(keys.responses_prefix(run_id)))
    remaining = max(0, resp_count - completed - failed)
    return {
        "completed": completed,
        "failed": failed,
        "remaining": remaining,
        "current_item_id": cp.get("last_item_id"),
    }


@router.get("/{run_id}")
def get_run(run_id: str):
    state = get_state()
    result = {"run_id": run_id}
    if state.store.exists(keys.run_manifest(run_id)):
        result["manifest"] = state.store.get_json(keys.run_manifest(run_id))
    cp_key = keys.generate_checkpoint(run_id)
    if state.store.exists(cp_key):
        result["checkpoint"] = state.store.get_json(cp_key)
    job = state.jobs.get(f"generate:{run_id}")
    if job:
        result["job"] = job
    if "manifest" not in result:
        raise HTTPException(status_code=404, detail="run not found")
    return result


@router.get("/{run_id}/rename-status")
def get_rename_status(run_id: str):
    op = get_state().rename_tracker.get(run_id)
    if op is None:
        raise HTTPException(status_code=404, detail="rename not found")
    return _rename_status_payload(op)


@router.patch("/{run_id}")
def patch_run(run_id: str, body: RenameRunRequest, response: Response):
    state = get_state()
    job_id = f"generate:{run_id}"
    job = state.jobs.get(job_id)
    if job and job.state in (JobState.running, JobState.awaiting_decision):
        raise HTTPException(status_code=409, detail="cannot rename while run is active")

    existing = state.rename_tracker.get(run_id)
    if existing and existing.status == "in_progress":
        response.status_code = 202
        return {"ok": True, **_rename_status_payload(existing)}

    try:
        plan = plan_rename(state.store, run_id, body.run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="run not found") from None
    except RunConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if plan.noop:
        try:
            _drop_rename_jobs(state, run_id, body.run_id)
        except JobAlreadyRunningError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {
            "ok": True,
            "old_run_id": run_id,
            "new_run_id": body.run_id,
            "status": "completed",
            "phase": "done",
            "total": 0,
            "copied": 0,
            "skipped": 0,
            "error": None,
        }

    op = state.rename_tracker.start(run_id, body.run_id, plan.total)
    payload = {"ok": True, **_rename_status_payload(op)}
    thread = threading.Thread(
        target=_run_rename_background,
        args=(state, run_id, body.run_id),
        name=f"rename:{run_id}",
        daemon=True,
    )
    thread.start()
    response.status_code = 202
    return payload


_TERMINAL_JOB_STATES = {
    JobState.completed,
    JobState.failed,
    JobState.stopped,
    JobState.cancelled,
}


def _snapshot_event(job):
    return {
        "event": "snapshot",
        "data": json.dumps(
            Event(type="snapshot", job=job, at=datetime.now(timezone.utc)).model_dump(mode="json")
        ),
    }


def _stream_job_events(state, job_id: str, run_id: str, *, judge_run_id: str | None = None):
    async def gen():
        queue = state.bus.subscribe()
        try:
            job = state.jobs.get(job_id)
            if not job:
                return
            yield _snapshot_event(job)
            if job.state in _TERMINAL_JOB_STATES:
                return
            while True:
                event = await queue.get()
                if event.job.run_id != run_id:
                    continue
                if judge_run_id is not None and event.job.judge_run_id != judge_run_id:
                    continue
                yield {"event": event.type, "data": json.dumps(event.model_dump(mode="json"))}
                if event.type in ("finished", "error"):
                    break
        finally:
            state.bus.unsubscribe(queue)

    return gen


@router.get("/{run_id}/events")
async def run_events(run_id: str):
    state = get_state()
    job_id = f"generate:{run_id}"
    return EventSourceResponse(_stream_job_events(state, job_id, run_id)())


@router.post("/{run_id}/decision")
def run_decision(run_id: str, body: DecisionRequest):
    state = get_state()
    try:
        state.jobs.submit_decision(f"generate:{run_id}", Decision(body.decision))
    except JobAlreadyRunningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except KeyError:
        raise HTTPException(status_code=404, detail="job not found") from None
    return {"ok": True}


@router.post("/{run_id}/cancel")
def cancel_run(run_id: str):
    get_state().jobs.cancel(f"generate:{run_id}")
    return {"ok": True}


@router.get("/{run_id}/responses")
def list_responses(run_id: str, limit: int = Query(50, ge=1, le=500), cursor: str | None = None):
    state = get_state()
    all_keys = state.store.list_keys(keys.responses_prefix(run_id))
    ids = sorted(keys.item_id_from_key(k) for k in all_keys)
    if cursor:
        ids = [i for i in ids if i > cursor]
    page = ids[:limit]
    items = [state.store.get_json(keys.response(run_id, i)) for i in page]
    next_cursor = page[-1] if len(page) == limit else None
    return {"items": items, "next_cursor": next_cursor}


@router.get("/{run_id}/responses/{item_id}")
def get_response(run_id: str, item_id: str):
    try:
        return get_state().store.get_json(keys.response(run_id, item_id))
    except KeyError:
        raise HTTPException(status_code=404, detail="response not found") from None


@router.get("/{run_id}/failures/{item_id}")
def get_failure(run_id: str, item_id: str):
    try:
        return get_state().store.get_json(keys.generate_failure(run_id, item_id))
    except KeyError:
        raise HTTPException(status_code=404, detail="failure not found") from None


@router.post("/{run_id}/judges", status_code=202)
def start_judges(run_id: str, body: StartJudgeRequest):
    state = get_state()
    if not state.store.exists(keys.run_manifest(run_id)):
        raise HTTPException(status_code=404, detail="run not found")
    started = []
    for judge_id in body.judge_ids:
        try:
            spec = get_judge(state.store, judge_id)
        except ConfigError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if not os.environ.get(spec.api_key_env):
            raise HTTPException(
                status_code=400,
                detail=f"missing environment variable: {spec.api_key_env}",
            )
        judge_run_id = (body.judge_run_ids or {}).get(judge_id, judge_id)
        job_id = f"judge:{run_id}:{judge_run_id}"

        def make_work(judge_run_id=judge_run_id, spec=spec, on_failure=body.on_failure):
            def work(ctx: JobContext):
                job = ctx.job
                gate = _gate_for_request(on_failure, job, state.bus, ctx.cancel_event)
                ctx.gate = gate

                def on_progress(p: Progress) -> None:
                    job.progress = p
                    state.bus.publish(
                        Event(type="progress", job=job.model_copy(deep=True), at=datetime.now(timezone.utc))
                    )

                summary = run_judge(
                    run_id=run_id,
                    judge_spec=spec,
                    judge_run_id=judge_run_id,
                    store=state.store,
                    client=build_judge_client(spec),
                    gate=gate,
                    on_progress=on_progress,
                    should_cancel=ctx.cancel_event.is_set,
                )
                state.bus.publish(
                    Event(type="finished", job=job.model_copy(deep=True), at=datetime.now(timezone.utc))
                )
                return summary

            return work

        try:
            job = state.jobs.start(job_id, "judge", run_id, make_work(), judge_run_id=judge_run_id)
            started.append(job)
        except JobAlreadyRunningError:
            break
    return started


@router.get("/{run_id}/judges")
def list_judge_runs(run_id: str):
    prefix = keys.judges_prefix(run_id)
    manifests = []
    for key in get_state().store.list_keys(prefix):
        if key.endswith("/judge.json"):
            manifests.append(get_state().store.get_json(key))
    return manifests


@router.get("/{run_id}/judges/{judge_run_id}")
def get_judge_run(run_id: str, judge_run_id: str):
    state = get_state()
    key = keys.judge_manifest(run_id, judge_run_id)
    if not state.store.exists(key):
        raise HTTPException(status_code=404, detail="judge run not found")
    result = {"manifest": state.store.get_json(key)}
    cp_key = keys.judge_checkpoint(run_id, judge_run_id)
    if state.store.exists(cp_key):
        result["checkpoint"] = state.store.get_json(cp_key)
    job = state.jobs.get(f"judge:{run_id}:{judge_run_id}")
    if job:
        result["job"] = job
    return result


@router.get("/{run_id}/judges/{judge_run_id}/events")
async def judge_events(run_id: str, judge_run_id: str):
    state = get_state()
    job_id = f"judge:{run_id}:{judge_run_id}"
    return EventSourceResponse(_stream_job_events(state, job_id, run_id, judge_run_id=judge_run_id)())


@router.post("/{run_id}/judges/{judge_run_id}/decision")
def judge_decision(run_id: str, judge_run_id: str, body: DecisionRequest):
    try:
        get_state().jobs.submit_decision(f"judge:{run_id}:{judge_run_id}", Decision(body.decision))
    except JobAlreadyRunningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except KeyError:
        raise HTTPException(status_code=404, detail="job not found") from None
    return {"ok": True}


@router.post("/{run_id}/judges/{judge_run_id}/cancel")
def cancel_judge(run_id: str, judge_run_id: str):
    get_state().jobs.cancel(f"judge:{run_id}:{judge_run_id}")
    return {"ok": True}


@router.get("/{run_id}/judges/{judge_run_id}/scores")
def list_scores(run_id: str, judge_run_id: str, limit: int = Query(50, ge=1, le=500), cursor: str | None = None):
    state = get_state()
    all_keys = state.store.list_keys(keys.scores_prefix(run_id, judge_run_id))
    ids = sorted(keys.item_id_from_key(k) for k in all_keys)
    if cursor:
        ids = [i for i in ids if i > cursor]
    page = ids[:limit]
    items = [state.store.get_json(keys.score(run_id, judge_run_id, i)) for i in page]
    next_cursor = page[-1] if len(page) == limit else None
    return {"items": items, "next_cursor": next_cursor}
