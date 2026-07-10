from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import settings
from app.services.ai.base import AIUnavailableError


class DigestLLMClient:
    def __init__(self) -> None:
        self.base_url = settings.digest_llm_base_url.rstrip("/")
        self.api_key = settings.digest_llm_api_key or "ollama"
        self.model = settings.digest_llm_model

    def is_configured(self) -> bool:
        return bool(self.model)

    def complete_json(self, *, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        if not self.is_configured():
            raise AIUnavailableError("Digest LLM is not configured")

        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            timeout=120,
        )
        response.raise_for_status()

        payload = response.json()
        try:
            content = str(payload["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as exc:
            raise AIUnavailableError("Digest LLM response did not contain message content") from exc

        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            raise AIUnavailableError("Digest LLM response was not valid JSON") from exc


def _is_ollama_base_url(base_url: str) -> bool:
    host = urlparse(base_url).hostname or ""
    return host in {"localhost", "127.0.0.1", "::1"} and ":11434" in base_url


def check_ollama_health() -> bool:
    client = DigestLLMClient()
    if not client.is_configured():
        return False
    try:
        if _is_ollama_base_url(client.base_url):
            response = httpx.get(
                client.base_url.replace("/v1", "") + "/api/tags",
                timeout=5,
            )
            return response.status_code == 200

        response = httpx.get(f"{client.base_url}/models", headers={"Authorization": f"Bearer {client.api_key}"}, timeout=5)
        return response.status_code == 200
    except httpx.HTTPError:
        return False
