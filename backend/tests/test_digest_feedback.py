from __future__ import annotations

import uuid
from collections.abc import Generator
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
from app.models.entry import Entry
from app.services.agent.article_feedback import (
    FeedbackExample,
    FeedbackProfile,
    candidate_matches_negative_themes,
    load_feedback_profile,
)
from app.services.agent.digest import _filter_with_llm, _prefilter_candidates
from app.services.agent.tools.web_search import SearchResult
from app.storage.local import LocalFileStorage
from tests.auth_helpers import create_user_token as _register


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
    resources.storage = LocalFileStorage(tmp_path / "files")

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        resources.storage = original_storage
        Base.metadata.drop_all(bind=engine)
        engine.dispose()




def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_article(client: TestClient, headers: dict[str, str], *, title: str, url: str, **metadata) -> str:
    payload = {
        "type": "resource",
        "title": title,
        "content": f"Summary for {title}",
        "metadata": {
            "kind": "article",
            "url": url,
            "source": "daily_digest",
            "discovered_at": metadata.get("discovered_at", "2026-07-10"),
            **metadata,
        },
    }
    response = client.post("/api/v1/entries", headers=headers, json=payload)
    assert response.status_code == 201
    return response.json()["id"]


def test_article_feedback_soft_hides_entry(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)
    entry_id = _create_article(
        client,
        headers,
        title="Cursor agents",
        url="https://habr.com/ru/articles/1/",
    )

    response = client.post(
        "/api/v1/agent/digest/feedback",
        headers=headers,
        json={"entry_id": entry_id, "feedback": "dislike"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["metadata"]["article_hidden"] is True
    assert body["metadata"]["article_feedback"] == "dislike"
    assert body["metadata"]["feedback_at"]

    still_there = client.get(f"/api/v1/entries/{entry_id}", headers=headers)
    assert still_there.status_code == 200

    hidden_from_list = client.get(
        "/api/v1/entries?type=resource&kind=article&exclude_hidden=true",
        headers=headers,
    )
    assert hidden_from_list.status_code == 200
    assert hidden_from_list.json()["total"] == 0

    visible_without_filter = client.get("/api/v1/entries?type=resource&kind=article", headers=headers)
    assert visible_without_filter.json()["total"] == 1


def test_entries_sort_discovered_at_desc(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    _create_article(
        client,
        headers,
        title="Older article",
        url="https://habr.com/ru/articles/old/",
        discovered_at="2026-07-01",
    )
    _create_article(
        client,
        headers,
        title="Newer article",
        url="https://habr.com/ru/articles/new/",
        discovered_at="2026-07-10",
    )

    response = client.get(
        "/api/v1/entries?type=resource&kind=article&sort=discovered_at_desc",
        headers=headers,
    )
    assert response.status_code == 200
    titles = [item["title"] for item in response.json()["items"]]
    assert titles == ["Newer article", "Older article"]


def test_load_feedback_profile_collects_blocked_urls(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)
    article_url = "https://habr.com/ru/articles/k8s/"
    entry_id = _create_article(
        client,
        headers,
        title="Kubernetes tutorial",
        url=article_url,
    )

    feedback = client.post(
        "/api/v1/agent/digest/feedback",
        headers=headers,
        json={"entry_id": entry_id, "feedback": "off_topic"},
    )
    assert feedback.status_code == 200

    db = next(app.dependency_overrides[get_db]())
    try:
        entry = db.get(Entry, uuid.UUID(entry_id))
        assert entry is not None
        profile = load_feedback_profile(db, entry.user_id)
        assert article_url in profile.blocked_urls
        assert profile.examples[0].feedback == "off_topic"
        assert profile.negative_themes
    finally:
        db.close()


def test_prefilter_candidates_blocks_urls_and_themes() -> None:
    profile = FeedbackProfile(
        blocked_urls={"https://habr.com/ru/articles/blocked/"},
        negative_themes=["kubernetes"],
    )
    candidates = [
        SearchResult(
            title="Blocked article",
            url="https://habr.com/ru/articles/blocked/",
            snippet="About agents",
            query="cursor",
        ),
        SearchResult(
            title="Kubernetes deployment guide",
            url="https://habr.com/ru/articles/k8s/",
            snippet="Cluster setup",
            query="cursor",
        ),
        SearchResult(
            title="Cursor agents workflow",
            url="https://habr.com/ru/articles/agents/",
            snippet="Agentic coding",
            query="cursor",
        ),
    ]

    filtered = _prefilter_candidates(candidates, profile)
    assert len(filtered) == 1
    assert filtered[0].url == "https://habr.com/ru/articles/agents/"


def test_candidate_matches_negative_themes() -> None:
    assert candidate_matches_negative_themes("Kubernetes cluster setup", ["kubernetes"])
    assert not candidate_matches_negative_themes("Cursor agents", ["kubernetes"])


@patch("app.services.agent.digest.DigestLLMClient")
def test_filter_with_llm_includes_feedback_context(mock_client_cls: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.is_configured.return_value = True
    mock_client.complete_json.return_value = {"articles": []}
    mock_client_cls.return_value = mock_client

    profile = FeedbackProfile(
        examples=[
            FeedbackExample(
                title="Generic React tutorial",
                summary="Hooks and components",
                url="https://habr.com/ru/articles/react/",
                query="cursor ai",
                feedback="off_topic",
            )
        ]
    )
    candidates = [
        SearchResult(
            title="Cursor agents",
            url="https://habr.com/ru/articles/1/",
            snippet="Agent workflow",
            query="cursor ai",
        )
    ]

    _filter_with_llm(candidates, max_articles=3, feedback_profile=profile, profile_name="ai")

    system_prompt = mock_client.complete_json.call_args.kwargs["system_prompt"]
    assert "User feedback" in system_prompt
    assert "Generic React tutorial" in system_prompt
    assert "off_topic" in system_prompt
