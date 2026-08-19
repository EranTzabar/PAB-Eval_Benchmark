"""Pytest configuration and shared fixtures."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from pab_eval.dataset import default_dataset_paths, load_chains, load_prompts

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PROMPTS_PATH, CHAINS_PATH = default_dataset_paths()


@pytest.fixture(scope="session")
def prompts():
    if not PROMPTS_PATH.is_file():
        pytest.skip(f"dataset not found: {PROMPTS_PATH}")
    return load_prompts(PROMPTS_PATH)


@pytest.fixture(scope="session")
def chains():
    if not CHAINS_PATH.is_file():
        pytest.skip(f"dataset not found: {CHAINS_PATH}")
    return load_chains(CHAINS_PATH)
