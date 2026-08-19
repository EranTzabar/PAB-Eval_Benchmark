"""OpenAI-compatible chat completions client."""

from __future__ import annotations

import time

import httpx

from pab_eval.clients.base import Completion


def normalize_base_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if not base.endswith("/v1"):
        base = f"{base}/v1"
    return base


class OpenAICompatClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout_s: float = 120.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = normalize_base_url(base_url)
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_s
        self._transport = transport

    def complete(
        self,
        *,
        system: str | None,
        messages: list[dict],
        temperature: float,
    ) -> Completion:
        body_messages: list[dict] = []
        if system is not None:
            body_messages.append({"role": "system", "content": system})
        body_messages.extend(messages)

        payload = {
            "model": self._model,
            "temperature": temperature,
            "messages": body_messages,
        }

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        start = time.perf_counter()
        with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
            resp = client.post(
                f"{self._base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time.perf_counter() - start) * 1000.0
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage") or {}
        return Completion(
            text=text,
            latency_ms=latency_ms,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
        )
