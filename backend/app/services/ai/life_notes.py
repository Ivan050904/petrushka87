from __future__ import annotations

import json
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.core.token_sources import is_github_token, read_desktop_token
from app.services.ai.base import AIUnavailableError, AIUsage
from app.services.ai.prompts.life_notes_analyze import LIFE_NOTES_ANALYZE_SYSTEM_PROMPT

GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference"
OPENAI_BASE_URL = "https://api.openai.com/v1"
GITHUB_DEFAULT_MODEL = "openai/gpt-4o-mini"
OPENAI_DEFAULT_MODEL = "gpt-4o-mini"


class LifeNoteDrySpot(BaseModel):
    quote: str = Field(min_length=1)
    issue: str = Field(min_length=1)
    suggestion: str = Field(min_length=1)


class LifeNoteAnalyzeResult(BaseModel):
    tone: str = Field(min_length=1)
    dry_spots: list[LifeNoteDrySpot] = Field(default_factory=list)
    summary: str = Field(min_length=1)
    usage: AIUsage | None = None


def _resolve_notes_ai_config() -> tuple[str, str, str, str]:
    if not settings.notes_ai_enabled:
        raise AIUnavailableError("Notes AI is disabled")

    api_key = settings.notes_ai_api_key.strip()
    if not api_key:
        api_key = settings.openai_compatible_api_key.strip()
    if not api_key:
        api_key = read_desktop_token()
    if not api_key:
        raise AIUnavailableError("Notes AI token is not configured")

    provider = settings.notes_ai_provider.strip().lower()
    if not provider or provider == "auto":
        provider = "github" if is_github_token(api_key) else "openai"

    base_url = settings.notes_ai_base_url.strip()
    if not base_url:
        base_url = GITHUB_MODELS_BASE_URL if provider == "github" else OPENAI_BASE_URL

    model = settings.notes_ai_model.strip()
    if not model:
        model = GITHUB_DEFAULT_MODEL if provider == "github" else OPENAI_DEFAULT_MODEL

    return provider, api_key, base_url.rstrip("/"), model


def analyze_life_note(content: str, entry_date: str | None = None) -> LifeNoteAnalyzeResult:
    provider, api_key, base_url, model = _resolve_notes_ai_config()

    user_message = content.strip()
    if entry_date:
        user_message = f"Дата записи: {entry_date}\n\n{user_message}"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == "github":
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"

    response = httpx.post(
        f"{base_url}/chat/completions",
        headers=headers,
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": LIFE_NOTES_ANALYZE_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        },
        timeout=60,
    )
    response.raise_for_status()

    payload = response.json()
    raw_content = _extract_message_content(payload)
    try:
        raw_result = json.loads(raw_content)
    except json.JSONDecodeError as exc:
        raise AIUnavailableError("AI response was not valid JSON") from exc

    try:
        result = LifeNoteAnalyzeResult.model_validate(raw_result)
    except ValidationError as exc:
        raise AIUnavailableError("AI response did not match analysis schema") from exc

    usage = _extract_usage(payload, provider=provider, model=model)
    return result.model_copy(update={"usage": usage})


def _extract_message_content(payload: dict[str, Any]) -> str:
    try:
        return str(payload["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError) as exc:
        raise AIUnavailableError("AI response did not contain message content") from exc


def _extract_usage(payload: dict[str, Any], *, provider: str, model: str) -> AIUsage | None:
    usage_payload = payload.get("usage")
    if not isinstance(usage_payload, dict):
        return None

    input_tokens = int(usage_payload.get("prompt_tokens") or usage_payload.get("input_tokens") or 0)
    output_tokens = int(usage_payload.get("completion_tokens") or usage_payload.get("output_tokens") or 0)
    total_tokens = int(usage_payload.get("total_tokens") or input_tokens + output_tokens)

    return AIUsage(
        provider=provider,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
    )
