"""Dataset introspection."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from pab_eval.api.deps import get_state
from pab_eval.api.stores import get_dataset_view, put_dataset_view
from pab_eval.dataset import default_dataset_paths, load_dataset
from pab_eval.dataset_view import DatasetViewUpdate
from pab_eval.errors import DatasetError

router = APIRouter(prefix="/dataset", tags=["dataset"])

MULTI_TURN_DRIFT = "multi_turn_drift"


@router.get("")
def dataset_status():
    prompts_path, chains_path = default_dataset_paths()
    if not prompts_path.is_file() or not chains_path.is_file():
        raise HTTPException(status_code=503, detail="dataset files not found on disk")
    try:
        ds = load_dataset(prompts_path, chains_path)
    except DatasetError as exc:
        return {"valid": False, "error": str(exc)}
    return {
        "valid": True,
        "singles": len(ds.prompts),
        "chains": len(ds.chains),
        "turns": sum(len(c.turns) for c in ds.chains),
        "total_instances": len(ds.prompts) + sum(len(c.turns) for c in ds.chains),
    }


@router.get("/items")
def dataset_items():
    prompts_path, chains_path = default_dataset_paths()
    if not prompts_path.is_file() or not chains_path.is_file():
        raise HTTPException(status_code=503, detail="dataset files not found on disk")
    try:
        ds = load_dataset(prompts_path, chains_path)
    except DatasetError as exc:
        return {"valid": False, "error": str(exc), "prompts": [], "chains": []}

    prompts = [
        {"id": p.id, "category": p.category, "text": p.text}
        for p in ds.prompts
    ]
    chains = [
        {
            "id": turn.id,
            "chain_id": chain.chain_id,
            "turn": turn.turn,
            "category": MULTI_TURN_DRIFT,
            "archetype": chain.archetype,
            "text": turn.text,
        }
        for chain in ds.chains
        for turn in sorted(chain.turns, key=lambda t: t.turn)
    ]
    return {"valid": True, "prompts": prompts, "chains": chains}


@router.get("/view")
def dataset_view_get():
    try:
        from pab_eval.dataset_view import load_current_dataset_sha

        view = get_dataset_view(get_state().store)
        _, current_sha = load_current_dataset_sha()
    except DatasetError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    payload = view.model_dump(mode="json")
    payload["current_dataset_sha256"] = current_sha
    return payload


@router.put("/view")
def dataset_view_put(body: DatasetViewUpdate):
    try:
        view = put_dataset_view(get_state().store, body)
    except DatasetError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return view.model_dump(mode="json")
