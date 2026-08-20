"""Uvicorn entry point."""

from __future__ import annotations

import os

import uvicorn

from pab_eval.api.app import create_app
from pab_eval.config import load_env


def main() -> None:
    load_env()
    host = os.environ.get("PAB_HOST", "127.0.0.1")
    port = int(os.environ.get("PAB_PORT", "8001"))
    uvicorn.run(create_app(), host=host, port=port)


if __name__ == "__main__":
    main()
