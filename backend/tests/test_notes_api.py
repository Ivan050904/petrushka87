from __future__ import annotations

import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes import entries as entry_routes
from app.api.routes import notes as notes_routes
from app.api.routes import resources
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services.ai.base import AIUsage
from app.services.ai.life_notes import LifeNoteAnalyzeResult
from app.storage.local import LocalFileStorage


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


from tests.auth_helpers import create_user_token as _register


def test_notes_analyze_returns_mocked_result(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    token = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    def fake_analyze(content: str, *, entry_date: str | None = None, context=None) -> LifeNoteAnalyzeResult:
        del entry_date, context
        return LifeNoteAnalyzeResult(
            tone="спокойный",
            summary=f"Кратко: {content[:40]}",
            dry_spots=[],
            usage=AIUsage(provider="test", model="mock", input_tokens=10, output_tokens=5),
        )

    monkeypatch.setattr(notes_routes, "analyze_text_with_context", fake_analyze)

    response = client.post(
        "/api/v1/notes/analyze",
        headers=headers,
        json={"content": "Сегодня был продуктивный день.", "entry_date": "2026-07-09"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["tone"] == "спокойный"
    assert "продуктивный" in body["summary"]
    assert body["usage"]["model"] == "mock"
