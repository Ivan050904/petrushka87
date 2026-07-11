from __future__ import annotations

import asyncio
from collections.abc import Generator
from dataclasses import replace
from datetime import UTC, date, datetime
from pathlib import Path
from unittest.mock import patch

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
from app.services.agent.digest import (
    DigestResult,
    compute_force_refresh_date_range,
    compute_search_date_range,
)
from app.services.agent.scheduler import compute_next_run_at
from app.services.agent.tools.habr_search import habr_search
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
    monkeypatch.setattr(entry_routes, "index_entry", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        "app.services.agent.scheduler.settings",
        replace(app_settings, digest_scheduler_enabled=False),
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


def _register(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "digest@test.local", "password": "secret12345", "full_name": "Digest User"},
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_compute_search_date_range_first_run() -> None:
    today = date(2026, 7, 10)
    result = compute_search_date_range(today=today, last_search_until=None, lookback_days=7)
    assert result is not None
    assert result.date_from == date(2026, 7, 3)
    assert result.date_to == today


def test_compute_search_date_range_incremental() -> None:
    today = date(2026, 7, 10)
    result = compute_search_date_range(today=today, last_search_until="2026-07-08", lookback_days=7)
    assert result is not None
    assert result.date_from == date(2026, 7, 9)
    assert result.date_to == today


def test_compute_search_date_range_up_to_date() -> None:
    today = date(2026, 7, 10)
    result = compute_search_date_range(today=today, last_search_until="2026-07-10", lookback_days=7)
    assert result is None


def test_compute_force_refresh_date_range() -> None:
    today = date(2026, 7, 11)
    result = compute_force_refresh_date_range(today=today, lookback_days=7)
    assert result.date_from == date(2026, 7, 4)
    assert result.date_to == today


@patch("app.api.routes.agent.run_daily_digest")
def test_digest_run_endpoint_force(mock_run_digest, client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    mock_run_digest.return_value = DigestResult(
        status="ok",
        articles_saved=2,
        articles_skipped=0,
        topics=["cursor ai"],
        message="Saved 2 articles, skipped 0",
        search_period_from="2026-07-04",
        search_period_to="2026-07-11",
    )

    response = client.post("/api/v1/agent/digest/run", headers=headers, json={"force": True})
    assert response.status_code == 200
    assert mock_run_digest.call_args.kwargs["force"] is True


def test_compute_next_run_at_before_schedule_hour() -> None:
    tz = UTC
    now = datetime(2026, 7, 10, 7, 30, tzinfo=tz)
    next_run = compute_next_run_at(now=now, schedule_hour=8, timezone_info=tz)
    assert next_run.date() == date(2026, 7, 10)
    assert next_run.hour == 8


def test_compute_next_run_at_after_schedule_hour() -> None:
    tz = UTC
    now = datetime(2026, 7, 10, 9, 0, tzinfo=tz)
    next_run = compute_next_run_at(now=now, schedule_hour=8, timezone_info=tz)
    assert next_run.date() == date(2026, 7, 11)
    assert next_run.hour == 8


def test_digest_scheduler_disabled_exits_immediately(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.agent import scheduler

    monkeypatch.setattr(
        scheduler,
        "settings",
        replace(app_settings, digest_scheduler_enabled=False),
    )
    asyncio.run(scheduler.digest_scheduler_loop())


@patch("app.services.agent.tools.habr_search.httpx.get")
def test_habr_search_filters_by_date(mock_get) -> None:
    mock_get.return_value.raise_for_status = lambda: None
    mock_get.return_value.json.return_value = {
        "pagesCount": 1,
        "publicationIds": ["1", "2", "3"],
        "publicationRefs": {
            "1": {
                "id": "1",
                "timePublished": "2026-07-10T10:00:00+00:00",
                "titleHtml": "Cursor agents on Habr",
                "leadData": {"textHtml": "<p>Fresh article</p>"},
            },
            "2": {
                "id": "2",
                "timePublished": "2026-07-01T10:00:00+00:00",
                "titleHtml": "Old article",
                "leadData": {"textHtml": "<p>Too old</p>"},
            },
            "3": {
                "id": "3",
                "timePublished": "2026-07-09T10:00:00+00:00",
                "titleHtml": "Claude Codex workflow",
                "leadData": {"textHtml": "<p>In range</p>"},
            },
        },
    }

    results = habr_search(
        "cursor ai",
        date_from=date(2026, 7, 9),
        date_to=date(2026, 7, 10),
        max_results=10,
        pause_seconds=0,
    )

    assert len(results) == 2
    assert {item.url for item in results} == {
        "https://habr.com/ru/articles/1/",
        "https://habr.com/ru/articles/3/",
    }
    assert results[0].published_at == "2026-07-10"
    assert results[0].source_site == "habr.com"


def test_entries_kind_filter(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    article = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "resource",
            "title": "FastAPI patterns",
            "content": "Useful article",
            "metadata": {
                "kind": "article",
                "url": "https://example.com/fastapi",
                "source": "daily_digest",
            },
        },
    )
    assert article.status_code == 201

    other = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "resource",
            "title": "Notes.pdf",
            "content": "Uploaded file",
            "metadata": {"kind": "pdf"},
        },
    )
    assert other.status_code == 201

    filtered = client.get("/api/v1/entries?type=resource&kind=article", headers=headers)
    assert filtered.status_code == 200
    body = filtered.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "FastAPI patterns"


@patch("app.api.routes.agent.run_daily_digest")
def test_digest_run_endpoint(mock_run_digest, client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    mock_run_digest.return_value = DigestResult(
        status="ok",
        articles_saved=2,
        articles_skipped=1,
        topics=["cursor ai"],
        message="Saved 2 articles, skipped 1",
        search_period_from="2026-07-09",
        search_period_to="2026-07-10",
    )

    response = client.post("/api/v1/agent/digest/run", headers=headers, json={})
    assert response.status_code == 200
    assert mock_run_digest.called
    body = response.json()
    assert body["status"] == "ok"
    assert body["articles_saved"] == 2
    assert body["topics"] == ["cursor ai"]
    assert body["search_period_from"] == "2026-07-09"


@patch("app.api.routes.agent.check_ollama_health", return_value=False)
def test_digest_status_endpoint(_mock_health, client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    response = client.get("/api/v1/agent/digest/status", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["ollama_reachable"] is False
    assert "configured_topics" in body
    assert body["search_provider"] == "habr"
    assert "next_search_from" in body
    assert "scheduler_enabled" in body
    assert "psychology" in body
