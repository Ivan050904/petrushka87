from __future__ import annotations

import uuid
from collections.abc import Generator
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes import entries as entry_routes
from app.api.routes import resources
from app.core.config import settings as app_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import assistant_session  # noqa: F401
from app.services.assistant.schemas import AssistantModelDecision
from app.services.assistant.tools import (
    build_pending,
    create_task_entry,
    missing_fields,
    update_entry_record,
)
from app.storage.local import LocalFileStorage


class FakeAssistantLLM:
    def __init__(self, decision: AssistantModelDecision) -> None:
        self.decision = decision

    def is_configured(self) -> bool:
        return True

    def decide(self, **_kwargs) -> AssistantModelDecision:
        return self.decision


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    original_storage = resources.storage
    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(entry_routes, "get_ai_client", lambda: None)
    resources.storage = LocalFileStorage(tmp_path / "files")

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        resources.storage = original_storage
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def _register(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "assistant@example.com",
            "password": "password12345",
            "full_name": "Assistant User",
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def test_missing_fields_for_event() -> None:
    pending = build_pending("create_event", {"title": "Созвон"})
    assert pending is not None
    assert pending.missing_fields == ["starts_at"]


def test_create_task_entry_direct(tmp_path: Path) -> None:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'assistant-tools.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    user_id = uuid.uuid4()

    result = create_task_entry(
        session,
        user_id=user_id,
        params={"title": "Купить молоко", "status": "active"},
    )
    assert result.type == "task"
    assert result.entry_id is not None
    assert missing_fields("create_task", {"title": "x"}) == []


def test_assistant_status_endpoint(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    token = _register(client)
    monkeypatch.setattr(
        "app.api.routes.assistant.check_assistant_provider_health",
        lambda: True,
    )
    response = client.get(
        "/api/v1/assistant/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "enabled" in body
    assert "configured" in body
    assert "classification_model" in body


def test_update_entry_record(tmp_path: Path) -> None:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'assistant-update.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    user_id = uuid.uuid4()

    created = create_task_entry(
        session,
        user_id=user_id,
        params={"title": "Старая задача", "status": "inbox"},
    )
    updated = update_entry_record(
        session,
        user_id=user_id,
        params={"entry_id": created.entry_id, "status": "done", "title": "Новая задача"},
    )
    assert updated.title == "Новая задача"
    assert updated.metadata["status"] == "done"


def test_assistant_chat_disabled(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    disabled_settings = SimpleNamespace(**{**app_settings.__dict__, "assistant_enabled": False})
    monkeypatch.setattr("app.api.routes.assistant.settings", disabled_settings)
    token = _register(client)
    response = client.post(
        "/api/v1/assistant/agent/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Создай задачу"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is False


def test_assistant_creates_task_with_mock_llm(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    enabled_settings = SimpleNamespace(
        **{
            **app_settings.__dict__,
            "assistant_enabled": True,
            "assistant_api_key": "test",
            "assistant_model": "test-model",
            "assistant_auto_confirm": True,
        }
    )
    monkeypatch.setattr("app.api.routes.assistant.settings", enabled_settings)
    monkeypatch.setattr("app.services.assistant.agent.settings", enabled_settings)

    fake = FakeAssistantLLM(
        AssistantModelDecision(
            reply="Создаю задачу.",
            action="create_task",
            params={"title": "Позвонить маме", "status": "active"},
            confidence=0.95,
        )
    )
    monkeypatch.setattr("app.services.assistant.agent.get_assistant_client", lambda: fake)

    token = _register(client)
    response = client.post(
        "/api/v1/assistant/agent/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Создай задачу позвонить маме"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    assert len(body["actions"]) == 1
    assert body["actions"][0]["type"] == "task"
    assert body["actions"][0]["title"] == "Позвонить маме"


def test_transcribe_disabled(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    disabled_settings = SimpleNamespace(**{**app_settings.__dict__, "speech_enabled": False})
    monkeypatch.setattr("app.api.routes.assistant.settings", disabled_settings)
    token = _register(client)
    response = client.post(
        "/api/v1/assistant/transcribe",
        headers={"Authorization": f"Bearer {token}"},
        files={"audio": ("voice.webm", b"fake-audio", "audio/webm")},
    )
    assert response.status_code == 503


def test_transcribe_success(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    enabled_settings = SimpleNamespace(**{**app_settings.__dict__, "speech_enabled": True})
    monkeypatch.setattr("app.api.routes.assistant.settings", enabled_settings)

    def fake_transcribe(
        _audio_bytes: bytes,
        *,
        content_type: str | None = None,
        filename: str | None = None,
    ) -> str:
        assert filename == "voice.webm"
        assert content_type == "audio/webm"
        return "Создай задачу позвонить маме"

    monkeypatch.setattr(
        "app.api.routes.assistant.transcribe_audio_bytes",
        fake_transcribe,
    )
    token = _register(client)
    response = client.post(
        "/api/v1/assistant/transcribe",
        headers={"Authorization": f"Bearer {token}"},
        files={"audio": ("voice.webm", b"fake-audio", "audio/webm")},
    )
    assert response.status_code == 200
    assert response.json()["text"] == "Создай задачу позвонить маме"
