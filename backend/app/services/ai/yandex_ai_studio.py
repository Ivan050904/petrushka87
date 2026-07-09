from __future__ import annotations

import json
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.services.ai.base import AIUnavailableError, AIUsage, EntryClassification, TaskParseResult
from app.services.ai.openai_compatible import SYSTEM_PROMPT, TASK_PARSE_PROMPT, _runtime_context

YANDEX_FLASH_SYNC_PRICING_PER_1000_RUB = {
    "input": 0.1,
    "cached_input": 0.025,
    "tool": 0.025,
    "output": 0.2,
}
YANDEX_FLASH_PRICING_NOTE = (
    "Alice AI LLM Flash sync tariff, RUB per 1000 tokens, user-provided on 2026-06-14"
)


class YandexAIStudioClient:
    def __init__(self) -> None:
        self.base_url = settings.yandex_ai_base_url.rstrip("/")
        self.api_key = settings.yandex_cloud_api_key
        self.folder_id = settings.yandex_cloud_folder_id
        self.model = settings.yandex_cloud_model

    def classify_entry(self, content: str) -> EntryClassification:
        if not self.api_key or not self.folder_id or not self.model:
            raise AIUnavailableError("Yandex AI Studio provider is not configured")

        response = httpx.post(
            f"{self.base_url}/responses",
            headers={
                "Authorization": f"Api-Key {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model_uri(),
                "instructions": f"{SYSTEM_PROMPT}\n\n{_runtime_context()}",
                "input": content,
                "temperature": 0,
                "max_output_tokens": 500,
            },
            timeout=20,
        )
        response.raise_for_status()

        payload = response.json()
        content_payload = _extract_response_text(payload)
        try:
            raw_result = json.loads(_clean_json_content(content_payload))
        except json.JSONDecodeError as exc:
            raise AIUnavailableError("Yandex AI response was not valid JSON") from exc

        try:
            classification = EntryClassification.model_validate(raw_result)
        except ValidationError as exc:
            raise AIUnavailableError("Yandex AI response did not match classification schema") from exc

        classification.usage = _usage_from_payload(payload, model=self._model_uri())
        return classification

    def parse_tasks(self, content: str) -> TaskParseResult:
        if not self.api_key or not self.folder_id or not self.model:
            raise AIUnavailableError("Yandex AI Studio provider is not configured")

        response = httpx.post(
            f"{self.base_url}/responses",
            headers={
                "Authorization": f"Api-Key {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model_uri(),
                "instructions": f"{TASK_PARSE_PROMPT}\n\n{_runtime_context()}",
                "input": content,
                "temperature": 0,
                "max_output_tokens": 900,
            },
            timeout=20,
        )
        response.raise_for_status()

        payload = response.json()
        content_payload = _extract_response_text(payload)
        try:
            raw_result = json.loads(_clean_json_content(content_payload))
        except json.JSONDecodeError as exc:
            raise AIUnavailableError("Yandex AI task parse response was not valid JSON") from exc

        try:
            result = TaskParseResult.model_validate(raw_result)
        except ValidationError as exc:
            raise AIUnavailableError("Yandex AI task parse response did not match schema") from exc

        result.usage = _usage_from_payload(payload, model=self._model_uri())
        return result

    def _model_uri(self) -> str:
        if self.model.startswith("gpt://"):
            return self.model
        return f"gpt://{self.folder_id}/{self.model}"


def _extract_response_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    try:
        content_items = payload["output"][0]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AIUnavailableError("Yandex AI response did not contain output text") from exc

    for item in content_items:
        if isinstance(item, dict) and isinstance(item.get("text"), str):
            return item["text"]

    raise AIUnavailableError("Yandex AI response did not contain output text")


def _clean_json_content(content: str) -> str:
    normalized = content.strip()
    if normalized.startswith("```"):
        lines = normalized.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        normalized = "\n".join(lines).strip()

    start = normalized.find("{")
    end = normalized.rfind("}")
    if start == -1 or end == -1 or end < start:
        return normalized
    return normalized[start : end + 1]


def _usage_from_payload(payload: dict[str, Any], *, model: str) -> AIUsage | None:
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        return None

    input_details = usage.get("input_tokens_details")
    if not isinstance(input_details, dict):
        input_details = {}

    input_tokens = _int_token_count(usage.get("input_tokens"))
    cached_input_tokens = _int_token_count(input_details.get("cached_tokens"))
    tool_tokens = _int_token_count(input_details.get("tool_tokens"))
    output_tokens = _int_token_count(usage.get("output_tokens"))
    total_tokens = _int_token_count(usage.get("total_tokens")) or input_tokens + output_tokens

    billable_input_tokens = max(input_tokens - cached_input_tokens - tool_tokens, 0)
    input_cost = _token_cost(billable_input_tokens, YANDEX_FLASH_SYNC_PRICING_PER_1000_RUB["input"])
    cached_cost = _token_cost(
        cached_input_tokens,
        YANDEX_FLASH_SYNC_PRICING_PER_1000_RUB["cached_input"],
    )
    tool_cost = _token_cost(tool_tokens, YANDEX_FLASH_SYNC_PRICING_PER_1000_RUB["tool"])
    output_cost = _token_cost(output_tokens, YANDEX_FLASH_SYNC_PRICING_PER_1000_RUB["output"])
    total_cost = round(input_cost + cached_cost + tool_cost + output_cost, 6)

    return AIUsage(
        provider="yandex",
        model=model,
        input_tokens=input_tokens,
        cached_input_tokens=cached_input_tokens,
        tool_tokens=tool_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        billable_input_tokens=billable_input_tokens,
        cost_rub=total_cost,
        input_cost_rub=input_cost,
        cached_input_cost_rub=cached_cost,
        tool_cost_rub=tool_cost,
        output_cost_rub=output_cost,
        pricing=YANDEX_FLASH_SYNC_PRICING_PER_1000_RUB,
        pricing_note=YANDEX_FLASH_PRICING_NOTE,
    )


def _int_token_count(value: Any) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _token_cost(tokens: int, price_per_1000: float) -> float:
    return round(tokens * price_per_1000 / 1000, 6)
