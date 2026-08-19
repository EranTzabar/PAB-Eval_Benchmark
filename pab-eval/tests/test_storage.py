"""Tests for storage layer."""

import pytest

from pab_eval.errors import ConfigError
from pab_eval.storage import keys
from pab_eval.storage.base import InMemoryStore
from pab_eval.storage.r2 import R2Store


def test_put_get_roundtrip():
    s = InMemoryStore()
    s.put_json("a/b.json", {"x": 1})
    assert s.get_json("a/b.json") == {"x": 1}


def test_exists_false_for_missing_key():
    assert InMemoryStore().exists("nope.json") is False


def test_get_json_missing_raises_keyerror():
    with pytest.raises(KeyError):
        InMemoryStore().get_json("nope.json")


def test_list_keys_filters_by_prefix():
    s = InMemoryStore()
    for k in ("runs/r1/responses/A.json", "runs/r1/responses/B.json", "runs/r2/responses/C.json"):
        s.put_json(k, {})
    assert sorted(s.list_keys("runs/r1/responses/")) == [
        "runs/r1/responses/A.json",
        "runs/r1/responses/B.json",
    ]


def test_key_builders_are_stable():
    assert keys.response("r1", "DIR_001") == "runs/r1/responses/DIR_001.json"
    assert keys.score("r1", "gpt5_judge", "DFT_124") == "runs/r1/judges/gpt5_judge/scores/DFT_124.json"
    assert keys.item_id_from_key(keys.response("r1", "DIR_001")) == "DIR_001"


def test_missing_r2_env_var_raises_config_error(monkeypatch):
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.delenv("R2_BUCKET", raising=False)
    with pytest.raises(ConfigError, match="R2_BUCKET"):
        R2Store.from_env()


def test_delete_is_idempotent():
    InMemoryStore().delete("never/existed.json")


def test_delete_prefix_removes_only_that_prefix():
    s = InMemoryStore()
    for k in ("personas/a/facts.md", "personas/a/memories/1.md", "personas/b/facts.md"):
        s.put_text(k, "x", "text/markdown")
    assert s.delete_prefix("personas/a/") == 2
    assert s.list_keys("personas/") == ["personas/b/facts.md"]


@pytest.mark.parametrize("bad", ["../escape", "a/b", "", "x" * 65, "sp ace"])
def test_key_builders_reject_unsafe_ids(bad):
    with pytest.raises(ValueError):
        keys.config(bad)
