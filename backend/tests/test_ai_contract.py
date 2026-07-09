from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError

from app.services.ai.base import EntryClassification
from app.services.ai import factory, openai_compatible, yandex_ai_studio


def test_openai_compatible_client_sends_runtime_context(
    monkeypatch,
) -> None:
    captured_payload: dict[str, Any] = {}

    monkeypatch.setattr(
        openai_compatible,
        "settings",
        SimpleNamespace(
            openai_compatible_base_url="https://ai.example/v1",
            openai_compatible_api_key="test-key",
            openai_compatible_model="test-model",
            user_timezone="Asia/Vladivostok",
        ),
    )

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"type":"task","title":"Call Maksim",'
                                '"metadata":{"status":"active","deadline":"2026-06-12T15:00"},'
                                '"confidence":0.93}'
                            )
                        }
                    }
                ]
            }

    def fake_post(*args: Any, **kwargs: Any) -> FakeResponse:
        captured_payload.update(kwargs["json"])
        return FakeResponse()

    monkeypatch.setattr(openai_compatible.httpx, "post", fake_post)

    result = openai_compatible.OpenAICompatibleClient().classify_entry(
        "Call Maksim tomorrow at 15:00"
    )

    assert result.type == "task"
    assert result.metadata["deadline"] == "2026-06-12T15:00"
    assert captured_payload["model"] == "test-model"
    assert captured_payload["response_format"] == {"type": "json_object"}
    assert captured_payload["messages"][0]["content"] == openai_compatible.SYSTEM_PROMPT
    runtime_context = captured_payload["messages"][1]["content"]
    assert "Current user date:" in runtime_context
    assert "User timezone: Asia/Vladivostok" in runtime_context


def test_yandex_ai_studio_client_uses_responses_api(
    monkeypatch,
) -> None:
    captured_url = ""
    captured_headers: dict[str, str] = {}
    captured_payload: dict[str, Any] = {}

    monkeypatch.setattr(
        yandex_ai_studio,
        "settings",
        SimpleNamespace(
            yandex_ai_base_url="https://ai.example/v1",
            yandex_cloud_api_key="test-key",
            yandex_cloud_folder_id="folder-id",
            yandex_cloud_model="aliceai-llm-flash/latest",
        ),
    )

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return {
                "output_text": (
                    '```json\n{"type":"task","title":"Call Maksim",'
                    '"metadata":{"status":"active","deadline":"2026-06-12T15:00"},'
                    '"confidence":0.93}\n```'
                ),
                "usage": {
                    "input_tokens": 460,
                    "input_tokens_details": {
                        "cached_tokens": 10,
                        "tool_tokens": 20,
                    },
                    "output_tokens": 81,
                    "total_tokens": 541,
                },
            }

    def fake_post(*args: Any, **kwargs: Any) -> FakeResponse:
        nonlocal captured_url
        captured_url = str(args[0])
        captured_headers.update(kwargs["headers"])
        captured_payload.update(kwargs["json"])
        return FakeResponse()

    monkeypatch.setattr(yandex_ai_studio.httpx, "post", fake_post)

    result = yandex_ai_studio.YandexAIStudioClient().classify_entry(
        "Call Maksim tomorrow at 15:00"
    )

    assert result.type == "task"
    assert result.metadata["deadline"] == "2026-06-12T15:00"
    assert captured_url == "https://ai.example/v1/responses"
    assert captured_headers["Authorization"] == "Api-Key test-key"
    assert captured_payload["model"] == "gpt://folder-id/aliceai-llm-flash/latest"
    assert captured_payload["input"] == "Call Maksim tomorrow at 15:00"
    assert captured_payload["temperature"] == 0
    assert captured_payload["max_output_tokens"] == 500
    assert openai_compatible.SYSTEM_PROMPT in captured_payload["instructions"]
    assert "Current user date:" in captured_payload["instructions"]
    assert result.usage is not None
    assert result.usage.provider == "yandex"
    assert result.usage.input_tokens == 460
    assert result.usage.cached_input_tokens == 10
    assert result.usage.tool_tokens == 20
    assert result.usage.output_tokens == 81
    assert result.usage.billable_input_tokens == 430
    assert result.usage.input_cost_rub == 0.043
    assert result.usage.cached_input_cost_rub == 0.00025
    assert result.usage.tool_cost_rub == 0.0005
    assert result.usage.output_cost_rub == 0.0162
    assert result.usage.cost_rub == 0.05995


def test_ai_factory_returns_yandex_provider_when_configured(monkeypatch) -> None:
    monkeypatch.setattr(
        factory,
        "settings",
        SimpleNamespace(
            ai_classification_enabled=True,
            ai_provider="yandex",
            yandex_cloud_api_key="test-key",
            yandex_cloud_folder_id="folder-id",
            yandex_cloud_model="aliceai-llm-flash/latest",
        ),
    )

    assert isinstance(factory.get_ai_client(), yandex_ai_studio.YandexAIStudioClient)


def test_ai_classification_rejects_food_until_supported() -> None:
    with pytest.raises(ValidationError):
        EntryClassification(type="food", title="Lunch", metadata={}, confidence=0.8)
