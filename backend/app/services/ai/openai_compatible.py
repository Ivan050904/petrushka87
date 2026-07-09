from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.services.ai.analyze import analyze_text_with_context, answer_stream
from app.services.ai.life_notes import LifeNoteAnalyzeResult

SYSTEM_PROMPT = """Classify one Folio-One personal note. Return JSON only:
{"type":"task|event|finance|person|note|diary|resource","title":"short title","metadata":{},"confidence":0-1}
Types: task=todo/reminder/action; event=class/conference/meeting/happening to track;
finance=income/expense; person=person info;
diary=first-person day/feelings; resource=link/file/media/book/film/article/recommendation;
note=fallback. Keep metadata compact JSON.
Metadata:
- task: status inbox|active|done|cancelled when possible; deadline as local YYYY-MM-DDTHH:mm for dates/times; optional project,parent_id.
- event: starts_at required when known; optional ends_at,location,status tracking|attending|skipped|cancelled,source_url.
- finance: amount, direction income|expense, currency default RUB, description.
- person: full_name; optional description,birthday YYYY-MM-DD,contacts[],notes.
- diary: entry_date YYYY-MM-DD when implied.
- resource: optional url,author,kind,description,source_person.
Resolve relative dates from the provided current date/time/timezone.
"""

TASK_PARSE_PROMPT = """Extract task records from user text. Return JSON only:
{"tasks":[{"title":"","description":null,"status":"inbox","priority":"medium","scheduled_at":null,"deadline":null,"planned_duration_minutes":null,"actual_duration_minutes":null,"reminder_at":null,"reminder_text":null,"recurrence":null,"tags":[],"assignee_name":null,"confidence":0.0}]}
Rules: split multiple tasks; ignore non-task chatter; do not invent tags; dates as local YYYY-MM-DDTHH:mm; title <=160 chars.
Priority: low|medium|high|urgent. Status: inbox unless text says active/done/cancelled.
Resolve relative dates from the provided current date/time/timezone.
"""


class OpenAICompatibleClient:
    def __init__(self) -> None:
        self.base_url = settings.openai_compatible_base_url.rstrip("/")
        self.api_key = settings.openai_compatible_api_key
        self.model = settings.openai_compatible_model

    def classify_entry(self, content: str) -> EntryClassification:
        if not self.api_key or not self.model:
            raise AIUnavailableError("AI provider is not configured")

        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "system", "content": _runtime_context()},
                    {"role": "user", "content": content},
                ],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            timeout=20,
        )
        response.raise_for_status()

        payload = response.json()
        content_payload = _extract_message_content(payload)
        try:
            raw_result = json.loads(content_payload)
        except json.JSONDecodeError as exc:
            raise AIUnavailableError("AI response was not valid JSON") from exc

        try:
            return EntryClassification.model_validate(raw_result)
        except ValidationError as exc:
            raise AIUnavailableError("AI response did not match classification schema") from exc

    def parse_tasks(self, content: str) -> TaskParseResult:
        if not self.api_key or not self.model:
            raise AIUnavailableError("AI provider is not configured")

        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": TASK_PARSE_PROMPT},
                    {"role": "system", "content": _runtime_context()},
                    {"role": "user", "content": content},
                ],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            timeout=20,
        )
        response.raise_for_status()

        payload = response.json()
        content_payload = _extract_message_content(payload)
        try:
            raw_result = json.loads(content_payload)
        except json.JSONDecodeError as exc:
            raise AIUnavailableError("AI task parse response was not valid JSON") from exc

        try:
            return TaskParseResult.model_validate(raw_result)
        except ValidationError as exc:
            raise AIUnavailableError("AI task parse response did not match schema") from exc

    def analyze_text(
        self,
        content: str,
        *,
        entry_date: str | None = None,
        context: Any | None = None,
    ) -> LifeNoteAnalyzeResult:
        return analyze_text_with_context(content, entry_date=entry_date, context=context)

    def answer(
        self,
        query: str,
        *,
        history: list[dict[str, str]],
        context: Any,
    ):
        return answer_stream(query=query, history=history, context=context)


def _extract_message_content(payload: dict[str, Any]) -> str:
    try:
        return str(payload["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError) as exc:
        raise AIUnavailableError("AI response did not contain message content") from exc


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
