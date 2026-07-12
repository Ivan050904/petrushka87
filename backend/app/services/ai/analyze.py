from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.services.ai.base import AIUnavailableError
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
Используй только предоставленный контекст пользователя, включая карту данных и даты записей.
Если данных не хватает — честно скажи об этом. Не выдумывай факты о пользователе.
При хронологическом обзоре упоминаний сущности группируй вывод по времени и указывай тип источника (заметка, терапия, тренировка и т.д.)."""


def _resolve_context_max_chars(provider: str) -> int:
    if provider == "github":
        return settings.context_llm_max_chars_github
    return settings.context_llm_max_chars


def _payload_too_large_message(provider: str) -> str:
    if provider == "github":
        return (
            "Запрос слишком большой для GitHub Models. "
            "Сформулируй вопрос уже — например «последние упоминания про зал за месяц» — "
            "или укажи OPENAI_API_KEY для Notes AI в backend/.env."
        )
    return "Запрос слишком большой для AI-провайдера. Сузь вопрос или уменьши CONTEXT_LLM_MAX_CHARS."


def answer_stream(
    *,
    query: str,
    history: list[dict[str, str]],
    context: UserContext,
) -> Iterator[str]:
    provider, api_key, base_url, model = _resolve_notes_ai_config()
    context_limit = _resolve_context_max_chars(provider)
    context_block = format_context_for_prompt(context, max_chars=context_limit)

    messages: list[dict[str, str]] = [
        {"role": "system", "content": ASSISTANT_SYSTEM_PROMPT},
        {"role": "system", "content": context_block},
    ]
    history_char_budget = max(2000, context_limit // 3)
    history_used = 0
    for item in reversed(history[-8:]):
        role = item.get("role")
        content = item.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str) or not content.strip():
            continue
        clipped = content.strip()
        if len(clipped) > 1500:
            clipped = clipped[:1497] + "..."
        if history_used + len(clipped) > history_char_budget:
            break
        messages.insert(2, {"role": role, "content": clipped})
        history_used += len(clipped)
    messages.append({"role": "user", "content": query.strip()})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == "github":
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"

    try:
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
            if response.status_code == 413:
                raise AIUnavailableError(_payload_too_large_message(provider))
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
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 413:
            raise AIUnavailableError(_payload_too_large_message(provider)) from exc
        raise


__all__ = [
    "LifeNoteAnalyzeResult",
    "LifeNoteDrySpot",
    "analyze_text_with_context",
    "answer_stream",
]
