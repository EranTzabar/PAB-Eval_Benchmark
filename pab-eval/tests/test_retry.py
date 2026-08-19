"""Tests for retry policy."""

import itertools

import httpx
import pytest

from pab_eval.errors import JudgeParseError
from pab_eval.retry import MAX_ATTEMPTS, AttemptsExhausted, call_with_retries, classify


def test_succeeds_first_attempt_makes_one_call():
    calls = []

    def fn():
        calls.append(1)
        return "ok"

    assert call_with_retries(fn, sleep=lambda s: None) == "ok"
    assert len(calls) == 1


def test_retries_then_succeeds_on_third():
    n = itertools.count()

    def flaky():
        if next(n) < 2:
            raise TimeoutError("timeout")
        return "ok"

    assert call_with_retries(flaky, sleep=lambda s: None) == "ok"


def test_gives_up_after_three_attempts_and_carries_them():
    calls = []

    def always_fails():
        calls.append(1)
        raise TimeoutError("boom")

    with pytest.raises(AttemptsExhausted) as exc:
        call_with_retries(always_fails, sleep=lambda s: None)
    assert len(calls) == MAX_ATTEMPTS == 3
    assert [a.number for a in exc.value.attempts] == [1, 2, 3]


def test_auth_error_still_gets_three_attempts():
    calls = []

    def auth_fail():
        calls.append(1)
        req = httpx.Request("POST", "https://example.com")
        resp = httpx.Response(401, request=req, text="Incorrect API key")
        raise httpx.HTTPStatusError("401", request=req, response=resp)

    with pytest.raises(AttemptsExhausted) as exc:
        call_with_retries(auth_fail, sleep=lambda s: None)
    assert len(calls) == 3
    assert exc.value.attempts[0].kind == "auth"


def test_backoff_is_exponential():
    slept = []
    with pytest.raises(AttemptsExhausted):
        call_with_retries(lambda: (_ for _ in ()).throw(TimeoutError("x")), sleep=slept.append)
    assert slept == [2.0, 4.0]


def test_classify_labels():
    req = httpx.Request("POST", "https://example.com")
    resp = httpx.Response(429, request=req)
    assert classify(httpx.HTTPStatusError("429", request=req, response=resp)) == "rate_limit"
    resp503 = httpx.Response(503, request=req)
    assert classify(httpx.HTTPStatusError("503", request=req, response=resp503)) == "server"
    assert classify(JudgeParseError("bad")) == "parse"
