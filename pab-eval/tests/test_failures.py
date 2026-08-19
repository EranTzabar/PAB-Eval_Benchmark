"""Tests for failure gate and reporting."""

import json

import pytest

from pab_eval.failures import (
    Decision,
    FailureDetail,
    FixedPolicyGate,
    build_failure_detail,
    hint_for_kind,
    render_failure_report,
)
from pab_eval.retry import Attempt


def _detail(kind="auth"):
    return build_failure_detail(
        item_id="DIR_001",
        pipe="generate",
        run_id="r1",
        judge_run_id=None,
        attempts=[Attempt(1, "HTTP 401", kind, 401, "bad key")],
        cumulative_attempts=1,
    )


def test_fixed_policy_gate_maps_policy_to_decision():
    assert FixedPolicyGate("abort").decide(_detail()) is Decision.STOP
    assert FixedPolicyGate("continue").decide(_detail()) is Decision.CONTINUE_ALL


def test_hint_is_derived_from_kind():
    assert "TARGET_API_KEY" in hint_for_kind("auth")
    assert "timeout_s" in hint_for_kind("timeout")


def test_report_includes_every_attempt_and_the_hint():
    detail = _detail()
    text = render_failure_report(detail)
    assert "DIR_001" in text
    assert "TARGET" in detail.hint


def test_detail_round_trips_through_json():
    d = _detail()
    assert FailureDetail.model_validate(json.loads(d.model_dump_json())) == d
