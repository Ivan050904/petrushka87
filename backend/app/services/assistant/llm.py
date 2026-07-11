from __future__ import annotations

import json
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.core.token_sources import is_github_token
from app.services.ai.base import AIUnavailableError
from app.services.assistant.prompts import ASSISTANT_SYSTEM_PROMPT
from app.services.assistant.schemas import AssistantModelDecision, AssistantSession, PendingAction


class AssistantLLMClient:
    def __init__(self) -> None:
        self.base_url = settings.assistant_base_url.rstrip("/")
        self.api_key = settings.assistant_api_key
        self.model = settings.assistant_model

    def is_configured(self) -> bool:
        return bool(settings.assistant_enabled and self.api_key and self.model)

    def decide(
        self,
        *,
        session: AssistantSession,
        user_message: str,
        pending: PendingAction | None,
        pending_confirmation: PendingAction | None,
    ) -> AssistantModelDecision:
        if not self.is_configured():
            raise AIUnavailableError("Assistant LLM is not configured")

        context_parts = [_runtime_context()]
        if pending is not None:
            context_parts.append(
                "Pending slot fill: "
                + json.dumps(pending.model_dump(mode="json"), ensure_ascii=False)
            )
        if pending_confirmation is not None:
            context_parts.append(
                "Awaiting user confirmation for: "
                + json.dumps(pending_confirmation.model_dump(mode="json"), ensure_ascii=False)
            )

        messages: list[dict[str, str]] = [
            {"role": "system", "content": ASSISTANT_SYSTEM_PROMPT},
        ]
        for part in context_parts:
            messages.append({"role": "system", "content": part})
        for item in session.messages:
            messages.append({"role": item.role, "content": item.content})
        messages.append({"role": "user", "content": user_message})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if is_github_token(self.api_key):
            headers["Accept"] = "application/vnd.github+json"
            headers["X-GitHub-Api-Version"] = "2022-11-28"

        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers=headers,
            json={
                "model": self.model,
                "messages": messages,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
            timeout=60,
        )
        response.raise_for_status()

        payload = response.json()
        try:
            content = str(payload["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as exc:
            raise AIUnavailableError("Assistant response did not contain message content") from exc

        try:
            raw = json.loads(content)
        except json.JSONDecodeError as exc:
            raise AIUnavailableError("Assistant response was not valid JSON") from exc

        try:
            return AssistantModelDecision.model_validate(raw)
        except ValidationError as exc:
            raise AIUnavailableError("Assistant response did not match schema") from exc


def check_assistant_provider_health() -> bool:
    client = AssistantLLMClient()
    if not client.is_configured():
        return False
    try:
        headers = {"Authorization": f"Bearer {client.api_key}"}
        if is_github_token(client.api_key):
            headers["Accept"] = "application/vnd.github+json"
            headers["X-GitHub-Api-Version"] = "2022-11-28"
        response = httpx.post(
            f"{client.base_url.rstrip('/')}/chat/completions",
            headers=headers,
            json={
                "model": client.model,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 3,
            },
            timeout=15,
        )
        return response.status_code == 200
    except httpx.HTTPError:
        return False


def get_assistant_client() -> AssistantLLMClient | None:
    client = AssistantLLMClient()
    return client if client.is_configured() else None


def _runtime_context() -> str:
    now = _now_for_user()
    return (
        f"Current user date: {now.date().isoformat()}. "
        f"Current user local datetime: {now.replace(microsecond=0).isoformat()}. "
        f"User timezone: {settings.user_timezone}."
    )


def _now_for_user() -> datetime:
    try:
        return datetime.now(ZoneInfo(settings.user_timezone))
    except ZoneInfoNotFoundError:
        return datetime.now(UTC)
