"""Run control endpoints."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from pab_eval.api.deps import get_state
from pab_eval.api.models import DecisionRequest, StartJudgeRequest, StartRunRequest
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

router = APIRouter(prefix="/runs", tags=["runs"])


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
    run_ids = sorted({keys.item_id_from_key(k) for k in state.store.list_keys(keys.runs_prefix()) if k.endswith("/run.json")})
    out = []
    for run_id in run_ids:
        item = {"run_id": run_id}
        job = state.jobs.get(f"generate:{run_id}")
        if job:
            item["job"] = job
        if state.store.exists(keys.run_manifest(run_id)):
            item["manifest"] = state.store.get_json(keys.run_manifest(run_id))
        out.append(item)
    return out


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
    started = []
    for judge_id in body.judge_ids:
        spec = get_judge(judge_id)
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
