"""Object storage protocol and in-memory fake."""

from __future__ import annotations

import json
from typing import Protocol


class ObjectStore(Protocol):
    def put_json(self, key: str, obj: dict) -> None: ...

    def get_json(self, key: str) -> dict: ...

    def put_text(self, key: str, text: str, content_type: str) -> None: ...

    def get_text(self, key: str) -> str: ...

    def delete(self, key: str) -> None: ...

    def delete_prefix(self, prefix: str) -> int: ...

    def exists(self, key: str) -> bool: ...

    def list_keys(self, prefix: str) -> list[str]: ...

    def list_keys_page(
        self, prefix: str, *, limit: int, start_after: str | None = None
    ) -> tuple[list[str], bool]: ...


class InMemoryStore:
    def __init__(self) -> None:
        self._json: dict[str, dict] = {}
        self._text: dict[str, tuple[str, str]] = {}

    def put_json(self, key: str, obj: dict) -> None:
        self._json[key] = obj

    def get_json(self, key: str) -> dict:
        if key not in self._json:
            raise KeyError(key)
        return self._json[key]

    def put_text(self, key: str, text: str, content_type: str) -> None:
        self._text[key] = (text, content_type)

    def get_text(self, key: str) -> str:
        if key not in self._text:
            raise KeyError(key)
        return self._text[key][0]

    def delete(self, key: str) -> None:
        self._json.pop(key, None)
        self._text.pop(key, None)

    def delete_prefix(self, prefix: str) -> int:
        count = 0
        for bucket in (self._json, self._text):
            for key in list(bucket):
                if key.startswith(prefix):
                    del bucket[key]
                    count += 1
        return count

    def exists(self, key: str) -> bool:
        return key in self._json or key in self._text

    def list_keys(self, prefix: str) -> list[str]:
        keys = set(self._json) | set(self._text)
        return sorted(k for k in keys if k.startswith(prefix))

    def list_keys_page(
        self, prefix: str, *, limit: int, start_after: str | None = None
    ) -> tuple[list[str], bool]:
        keys = self.list_keys(prefix)
        if start_after:
            keys = [k for k in keys if k > start_after]
        page = keys[:limit]
        return page, len(keys) > limit
