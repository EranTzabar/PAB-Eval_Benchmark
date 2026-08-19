"""Dataset introspection."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from pab_eval.dataset import default_dataset_paths, load_dataset
from pab_eval.errors import DatasetError

router = APIRouter(prefix="/dataset", tags=["dataset"])


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
