from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import httpx
from pydantic import ValidationError

from app.services.ai.base import AIUnavailableError, AIUsage
from app.services.ai.life_notes import (
    LifeNoteAnalyzeResult,
    LifeNoteDrySpot,
    _extract_message_content,
    _extract_usage,
    _resolve_notes_ai_config,
)
from app.services.ai.prompts.life_notes_analyze import LIFE_NOTES_ANALYZE_SYSTEM_PROMPT
from app.services.context.user_context import UserContext, format_context_for_prompt


def analyze_text_with_context(
    content: str,
    *,
    entry_date: str | None = None,
    context: UserContext | None = None,
) -> LifeNoteAnalyzeResult:
    provider, api_key, base_url, model = _resolve_notes_ai_config()

    user_message = content.strip()
    if entry_date:
        user_message = f"Дата записи: {entry_date}\n\n{user_message}"
    if context is not None and context.snippets:
        user_message = f"{format_context_for_prompt(context)}\n\nТекущая заметка:\n{user_message}"

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


ASSISTANT_SYSTEM_PROMPT = """Ты персональный ассистент Folio-One. Отвечай по-русски, кратко и по делу.
Используй только предоставленный контекст пользователя. Если данных не хватает — честно скажи об этом.
Не выдумывай факты о пользователе."""


def answer_stream(
    *,
    query: str,
    history: list[dict[str, str]],
    context: UserContext,
) -> Iterator[str]:
    provider, api_key, base_url, model = _resolve_notes_ai_config()
    context_block = format_context_for_prompt(context)

    messages: list[dict[str, str]] = [
        {"role": "system", "content": ASSISTANT_SYSTEM_PROMPT},
        {"role": "system", "content": context_block},
    ]
    for item in history[-12:]:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content.strip()})
    messages.append({"role": "user", "content": query.strip()})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == "github":
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"

    with httpx.stream(
        "POST",
        f"{base_url}/chat/completions",
        headers=headers,
        json={
            "model": model,
            "messages": messages,
            "temperature": 0.4,
            "stream": True,
        },
        timeout=120,
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if not line or not line.startswith("data: "):
                continue
            payload_raw = line[6:].strip()
            if payload_raw == "[DONE]":
                break
            try:
                payload: dict[str, Any] = json.loads(payload_raw)
            except json.JSONDecodeError:
                continue
            choices = payload.get("choices")
            if not isinstance(choices, list) or not choices:
                continue
            delta = choices[0].get("delta", {})
            if not isinstance(delta, dict):
                continue
            text = delta.get("content")
            if isinstance(text, str) and text:
                yield text


__all__ = [
    "LifeNoteAnalyzeResult",
    "LifeNoteDrySpot",
    "analyze_text_with_context",
    "answer_stream",
]
