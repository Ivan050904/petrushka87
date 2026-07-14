from __future__ import annotations

import uuid
from collections.abc import Generator
from datetime import UTC, date, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes import entries as entry_routes
from app.api.routes import resources
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services.agent.ai_queries import configured_ai_queries, get_active_ai_query_source
from app.services.agent.ai_query_tuner import tune_ai_queries
from app.services.agent.article_feedback import FeedbackExample, FeedbackProfile
from app.services.agent.digest_profiles import collect_ai_candidates
from app.services.agent.tools.web_search import SearchResult
from app.storage.local import LocalFileStorage
from tests.auth_helpers import create_user_token


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
    monkeypatch.setattr(entry_routes, "index_entry", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        "app.services.agent.scheduler.settings",
        __import__("dataclasses").replace(
            __import__("app.core.config", fromlist=["settings"]).settings,
            digest_scheduler_enabled=False,
        ),
    )
    resources.storage = LocalFileStorage(tmp_path / "files")

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        resources.storage = original_storage
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@patch("app.services.agent.ai_queries.load_digest_state")
def test_configured_ai_queries_uses_tuned_queries(mock_load_state: MagicMock) -> None:
    mock_load_state.return_value = MagicMock(
        tuned_queries=[
            "cursor ai agents site:habr.com",
            "claude codex site:habr.com",
            "github copilot agents site:habr.com",
            "mcp ai agents site:habr.com",
            "ии агенты site:habr.com",
        ],
        tuned_at=datetime.now(UTC).isoformat(),
    )
    user_id = uuid.uuid4()
    assert configured_ai_queries(user_id) == mock_load_state.return_value.tuned_queries
    assert get_active_ai_query_source(user_id) == "ollama"


@patch("app.services.agent.ai_query_tuner.DigestLLMClient")
@patch("app.services.agent.ai_query_tuner.check_ollama_health", return_value=True)
def test_tune_ai_queries_saves_tuned_queries(
    _mock_health: MagicMock,
    mock_llm_cls: MagicMock,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid.uuid4()
    state_path = tmp_path / "digest_state" / f"{user_id}.json"
    state_path.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("app.services.agent.state._state_path", lambda uid: state_path)

    mock_llm = MagicMock()
    mock_llm.is_configured.return_value = True
    mock_llm.complete_json.return_value = {
        "queries": [
            {"query": "cursor ai agents site:habr.com"},
            {"query": "claude codex site:habr.com"},
            {"query": "github copilot agents site:habr.com"},
            {"query": "mcp ai agents site:habr.com"},
            {"query": "ии агенты site:habr.com"},
        ]
    }
    mock_llm_cls.return_value = mock_llm

    profile = FeedbackProfile(
        examples=[
            FeedbackExample(
                title="Bad article",
                summary="Not useful",
                url="https://habr.com/ru/articles/1/",
                query="bad query",
                feedback="off_topic",
            )
            for _ in range(3)
        ]
    )
    result = tune_ai_queries(profile, user_id=user_id)
    assert result.status == "ok"
    assert len(result.queries) == 5
    assert configured_ai_queries(user_id) == result.queries


@patch("app.services.agent.ai_query_tuner.DigestLLMClient")
@patch("app.services.agent.ai_query_tuner.check_ollama_health", return_value=True)
def test_tune_ai_queries_rejects_unapproved_llm_sources(
    _mock_health: MagicMock,
    mock_llm_cls: MagicMock,
) -> None:
    mock_llm = MagicMock()
    mock_llm.is_configured.return_value = True
    mock_llm.complete_json.return_value = {
        "queries": [
            {"query": "cursor ai agents site:example.com"},
            {"query": "claude codex site:habr.com"},
            {"query": "github copilot agents site:habr.com"},
            {"query": "mcp ai agents site:habr.com"},
            {"query": "ии агенты site:habr.com"},
        ]
    }
    mock_llm_cls.return_value = mock_llm
    profile = FeedbackProfile(
        examples=[
            FeedbackExample(
                title="Rejected",
                summary="Not useful",
                url="https://habr.com/ru/articles/2/",
                query="old",
                feedback="off_topic",
            )
            for _ in range(3)
        ]
    )

    result = tune_ai_queries(profile, user_id=uuid.uuid4())
    assert result.status == "error"
    assert not result.queries


@patch("app.services.agent.digest_profiles.web_search")
@patch("app.services.agent.digest_profiles.get_tuned_ai_queries")
def test_collect_ai_candidates_uses_ddg_when_tuned(
    mock_tuned: MagicMock,
    mock_web_search: MagicMock,
) -> None:
    mock_tuned.return_value = ["cursor ai agents site:habr.com"]
    mock_web_search.return_value = [
        SearchResult(
            title="Cursor agents",
            url="https://habr.com/ru/articles/123/",
            snippet="About agents",
            query="cursor ai agents site:habr.com",
            source_site="habr.com",
        )
    ]

    results = collect_ai_candidates(
        ["ignored"],
        date_from=date(2026, 7, 1),
        date_to=date(2026, 7, 14),
        user_id=uuid.uuid4(),
    )
    assert len(results) == 1
    assert results[0].url.endswith("/123/")
    mock_web_search.assert_called_once()


def test_ai_tune_queries_endpoint(client: TestClient) -> None:
    token = create_user_token(
        client,
        email="ai-tune@test.local",
        password="secret12345",
        full_name="AI Tune",
    )
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.api.routes.agent.tune_ai_queries") as mock_tune:
        mock_tune.return_value = MagicMock(
            status="skipped",
            queries=[],
            message="Need at least 3 rejected articles before tuning queries",
            source="config",
        )
        response = client.post("/api/v1/agent/digest/ai/tune-queries", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "skipped"
