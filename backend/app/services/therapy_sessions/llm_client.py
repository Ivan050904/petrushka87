from __future__ import annotations

import json
import threading
import time
from collections.abc import Iterator

import httpx

from app.core.config import settings
from app.core.token_sources import is_github_token, read_desktop_token

GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference"
OPENAI_BASE_URL = "https://api.openai.com/v1"
GITHUB_DEFAULT_MODEL = "openai/gpt-4o"
OPENAI_DEFAULT_MODEL = "gpt-4o"

_last_request_at = 0.0
_throttle_lock = threading.Lock()


class TherapyLLMUnavailableError(RuntimeError):
    pass


def resolve_therapy_llm_config() -> tuple[str, str, str, str]:
    if not settings.therapy_sessions_enabled:
        raise TherapyLLMUnavailableError("Therapy sessions module is disabled")

    api_key = settings.therapy_llm_api_key.strip()
    if not api_key:
        api_key = settings.notes_ai_api_key.strip()
    if not api_key:
        api_key = settings.openai_compatible_api_key.strip()
    if not api_key:
        api_key = read_desktop_token()
    if not api_key:
        raise TherapyLLMUnavailableError("Therapy LLM token is not configured")

    provider = settings.therapy_llm_provider.strip().lower()
    if not provider or provider == "auto":
        provider = "github" if is_github_token(api_key) else "openai"

    base_url = settings.therapy_llm_base_url.strip()
    if not base_url:
        base_url = GITHUB_MODELS_BASE_URL if provider == "github" else OPENAI_BASE_URL

    model = settings.therapy_llm_model.strip()
    if not model:
        model = GITHUB_DEFAULT_MODEL if provider == "github" else OPENAI_DEFAULT_MODEL

    return provider, api_key, base_url.rstrip("/"), model


def current_model_name() -> str:
    return resolve_therapy_llm_config()[3]


def _headers(provider: str, api_key: str) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == "github":
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    return headers


def _throttle(provider: str) -> None:
    if provider != "github":
        return
    global _last_request_at
    with _throttle_lock:
        elapsed = time.time() - _last_request_at
        if elapsed < 2.5:
            time.sleep(2.5 - elapsed)
        _last_request_at = time.time()


def _extract_content(payload: dict) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise TherapyLLMUnavailableError("LLM response had no choices")
    message = choices[0].get("message", {})
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise TherapyLLMUnavailableError("LLM response was empty")
    return content.strip()


def therapy_generate(
    prompt: str,
    *,
    system: str | None = None,
    json_mode: bool = False,
    temperature: float = 0.3,
    max_retries: int = 5,
) -> str:
    provider, api_key, base_url, model = resolve_therapy_llm_config()
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    body: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    last_error: Exception | None = None
    for attempt in range(max_retries):
        try:
            _throttle(provider)
            response = httpx.post(
                f"{base_url}/chat/completions",
                headers=_headers(provider, api_key),
                json=body,
                timeout=180,
            )
            if response.status_code == 429 and attempt < max_retries - 1:
                time.sleep(2 ** attempt * 2)
                continue
            response.raise_for_status()
            return _extract_content(response.json())
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
                continue
            break
    raise TherapyLLMUnavailableError(str(last_error or "LLM request failed"))


def therapy_generate_json(prompt: str, *, system: str | None = None) -> dict:
    raw = therapy_generate(prompt, system=system, json_mode=True)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise TherapyLLMUnavailableError("LLM response was not valid JSON") from exc
    if not isinstance(payload, dict):
        raise TherapyLLMUnavailableError("LLM JSON root must be an object")
    return payload


def therapy_stream(prompt: str, *, system: str | None = None) -> Iterator[str]:
    provider, api_key, base_url, model = resolve_therapy_llm_config()
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    _throttle(provider)
    with httpx.stream(
        "POST",
        f"{base_url}/chat/completions",
        headers=_headers(provider, api_key),
        json={"model": model, "messages": messages, "temperature": 0.4, "stream": True},
        timeout=180,
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if not line or not line.startswith("data: "):
                continue
            payload_raw = line[6:].strip()
            if payload_raw == "[DONE]":
                break
            try:
                payload = json.loads(payload_raw)
            except json.JSONDecodeError:
                continue
            choices = payload.get("choices")
            if not isinstance(choices, list) or not choices:
                continue
            delta = choices[0].get("delta", {})
            if isinstance(delta, dict):
                text = delta.get("content")
                if isinstance(text, str) and text:
                    yield text
