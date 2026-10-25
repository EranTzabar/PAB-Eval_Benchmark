"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pab_eval.api.deps import AppState, set_state
from pab_eval.config import load_env
from pab_eval.errors import ConfigError, DatasetError, JobAlreadyRunningError, RunConflictError
from pab_eval.jobs.events import EventBus
from pab_eval.jobs.manager import JobManager
from pab_eval.storage.base import InMemoryStore, ObjectStore
from pab_eval.storage.r2 import R2Store
from pab_eval.api.routers import configs, dataset, judges, personas, runs, system


def _build_store() -> ObjectStore:
    if os.environ.get("R2_BUCKET"):
        return R2Store.from_env()
    return InMemoryStore()


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_env()
    store = _build_store()
    jobs = JobManager()
    bus = EventBus()
    bus.set_loop(asyncio.get_running_loop())
    set_state(AppState(store=store, jobs=jobs, bus=bus))
    yield
    jobs.shutdown()


def create_app(store: ObjectStore | None = None, job_manager: JobManager | None = None) -> FastAPI:
    app = FastAPI(title="PAB-Eval", lifespan=lifespan if store is None else None)

    origins = os.environ.get("PAB_CORS_ORIGINS", "http://localhost:3005").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in origins if o.strip()],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if store is not None:
        jobs = job_manager or JobManager()
        bus = EventBus()
        set_state(AppState(store=store, jobs=jobs, bus=bus))

    @app.exception_handler(ConfigError)
    async def config_error_handler(_: Request, exc: ConfigError):
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(DatasetError)
    async def dataset_error_handler(_: Request, exc: DatasetError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(RunConflictError)
    async def conflict_handler(_: Request, exc: RunConflictError):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(JobAlreadyRunningError)
    async def job_running_handler(_: Request, exc: JobAlreadyRunningError):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    app.include_router(system.router)
    app.include_router(configs.router)
    app.include_router(personas.router)
    app.include_router(dataset.router)
    app.include_router(judges.router)
    app.include_router(runs.router)

    return app
