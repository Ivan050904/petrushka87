from __future__ import annotations

import json
import threading
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.token_sources import is_github_token, read_desktop_token
from app.services.ai.base import AIUnavailableError

GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference"
OPENAI_BASE_URL = "https://api.openai.com/v1"
GITHUB_DEFAULT_MODEL = "openai/gpt-4o"
OPENAI_DEFAULT_MODEL = "gpt-4o"

_last_request_at = 0.0
_throttle_lock = threading.Lock()


class PsychDigestLLMClient:
    def __init__(self) -> None:
        self.provider, self.api_key, self.base_url, self.model = self._resolve_config()

    @staticmethod
    def _resolve_config() -> tuple[str, str, str, str]:
        api_key = settings.psych_digest_llm_api_key.strip()
        if not api_key:
            api_key = settings.therapy_llm_api_key.strip()
        if not api_key:
            api_key = settings.notes_ai_api_key.strip()
        if not api_key:
            api_key = settings.openai_compatible_api_key.strip()
        if not api_key:
            api_key = read_desktop_token()
        if not api_key:
            raise AIUnavailableError("Psych digest LLM token is not configured")

        provider = settings.psych_digest_llm_provider.strip().lower()
        if not provider or provider == "auto":
            provider = "github" if is_github_token(api_key) else "openai"

        base_url = settings.psych_digest_llm_base_url.strip()
        if not base_url:
            base_url = GITHUB_MODELS_BASE_URL if provider == "github" else OPENAI_BASE_URL

        model = settings.psych_digest_llm_model.strip()
        if not model:
            model = GITHUB_DEFAULT_MODEL if provider == "github" else OPENAI_DEFAULT_MODEL

        return provider, api_key, base_url.rstrip("/"), model

    def is_configured(self) -> bool:
        try:
            self._resolve_config()
            return bool(settings.psych_digest_llm_model.strip() or True)
        except AIUnavailableError:
            return False

    def complete_json(self, *, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        provider, api_key, base_url, model = self._resolve_config()
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if provider == "github":
            headers["Accept"] = "application/vnd.github+json"
            headers["X-GitHub-Api-Version"] = "2022-11-28"

        last_error: Exception | None = None
        for attempt in range(5):
            try:
                if provider == "github":
                    with _throttle_lock:
                        global _last_request_at
                        elapsed = time.time() - _last_request_at
                        if elapsed < 2.5:
                            time.sleep(2.5 - elapsed)
                        _last_request_at = time.time()

                response = httpx.post(
                    f"{base_url}/chat/completions",
                    headers=headers,
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.2,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=120,
                )
                if response.status_code == 429 and attempt < 4:
                    time.sleep(2 ** attempt * 2)
                    continue
                response.raise_for_status()
                payload = response.json()
                content = str(payload["choices"][0]["message"]["content"])
                parsed = json.loads(content)
                if not isinstance(parsed, dict):
                    raise AIUnavailableError("Psych digest LLM JSON root must be an object")
                return parsed
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt < 4:
                    time.sleep(2 ** attempt)
                    continue
                break
        raise AIUnavailableError(str(last_error or "Psych digest LLM request failed"))
