from __future__ import annotations

from collections.abc import Generator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings as app_settings
from app.db.base import Base
from app.models.entry import Entry
from app.models.user import User
from app.services.context.date_query import lookup_entries_by_date, parse_dates_from_query
from app.services.context.entry_rag_text import build_entry_rag_text, format_russian_date
from app.services.context.user_context import build_user_context, format_context_for_prompt


@pytest.fixture()
def db_session(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Session, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'context.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = session_factory()
    test_settings = replace(
        app_settings,
        context_candidate_limit=500,
        context_snippet_limit=20,
        context_max_chars=12000,
        context_date_lookup_enabled=True,
        context_router_multi_scope=True,
    )
    monkeypatch.setattr("app.services.context.orchestrator.settings", test_settings)
    monkeypatch.setattr("app.services.context.query_intent.settings", test_settings)
    monkeypatch.setattr("app.services.context.retrievers.base.settings", test_settings)
    monkeypatch.setattr("app.services.context.date_query.settings", test_settings)
    try:
        yield db
    finally:
        db.close()


def _create_user(db: Session) -> User:
    user = User(email="rag@test.local", full_name="RAG Test", hashed_password="hash")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_diary(
    db: Session,
    user: User,
    *,
    entry_date: str,
    title: str,
    content: str,
    collection: str | None = "life_notes",
) -> Entry:
    metadata: dict = {"entry_date": entry_date, "mode": "diary"}
    if collection:
        metadata["collection"] = collection
    entry = Entry(
        user_id=user.id,
        type="diary",
        title=title,
        content=content,
        metadata_=metadata,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def test_build_entry_rag_text_includes_entry_date_and_russian_date(db_session: Session) -> None:
    user = _create_user(db_session)
    entry = _create_diary(
        db_session,
        user,
        entry_date="2026-07-04",
        title="4 июля пятница",
        content="Сегодня был хороший день.",
    )
    text = build_entry_rag_text(entry)
    assert "entry_date: 2026-07-04" in text
    assert format_russian_date("2026-07-04") in text
    assert "Сегодня был хороший день." in text


def test_parse_dates_from_query_russian_iso_and_dot() -> None:
    assert parse_dates_from_query("заметка за 4 июля 2026") == ["2026-07-04"]
    assert parse_dates_from_query("2026-07-04") == ["2026-07-04"]
    assert parse_dates_from_query("04.07.2026") == ["2026-07-04"]


def test_build_user_context_finds_diary_by_russian_date(db_session: Session) -> None:
    user = _create_user(db_session)
    _create_diary(
        db_session,
        user,
        entry_date="2026-07-04",
        title="4 июля пятница",
        content="Запись про прогулку и кофе.",
    )
    context = build_user_context(
        db_session,
        user.id,
        "можешь прочитать что было в заметке дневника за 4 июля 2026",
        scope="all",
    )
    assert context.matched_dates == ["2026-07-04"]
    assert any("прогулку" in snippet.text for snippet in context.snippets)


def test_build_user_context_finds_demo_style_diary_title(db_session: Session) -> None:
    user = _create_user(db_session)
    _create_diary(
        db_session,
        user,
        entry_date="2026-07-04",
        title="День 04.07",
        content="Короткая запись за 2026-07-04. Настроение: спокойный.",
        collection=None,
    )
    context = build_user_context(
        db_session,
        user.id,
        "что было 4 июля 2026 в дневнике",
        scope="all",
    )
    assert any("2026-07-04" in snippet.text or snippet.entry_date == "2026-07-04" for snippet in context.snippets)


def test_direct_lookup_pins_old_entry(db_session: Session) -> None:
    user = _create_user(db_session)
    old_entry = _create_diary(
        db_session,
        user,
        entry_date="2025-01-15",
        title="Старый день",
        content="Архивная запись за январь.",
    )
    now = datetime.now(UTC)
    for index in range(510):
        db_session.add(
            Entry(
                user_id=user.id,
                type="note",
                title=f"Fresh note {index}",
                content=f"Noise content {index}",
                metadata_={},
                updated_at=now + timedelta(minutes=index),
            )
        )
    db_session.commit()

    context = build_user_context(
        db_session,
        user.id,
        "что было в дневнике 15 января 2025",
        scope="all",
    )
    assert any(snippet.entry_id == old_entry.id for snippet in context.snippets)


def test_lookup_entries_by_date_scope_notes(db_session: Session) -> None:
    user = _create_user(db_session)
    diary = _create_diary(
        db_session,
        user,
        entry_date="2026-07-04",
        title="4 июля",
        content="Life note body",
    )
    snippets = lookup_entries_by_date(db_session, user.id, "2026-07-04", "notes")
    assert len(snippets) == 1
    assert snippets[0].entry_id == diary.id


def test_format_context_for_prompt_shows_entry_date(db_session: Session) -> None:
    user = _create_user(db_session)
    _create_diary(
        db_session,
        user,
        entry_date="2026-07-04",
        title="4 июля",
        content="Текст записи.",
    )
    context = build_user_context(db_session, user.id, "4 июля 2026", scope="all")
    prompt = format_context_for_prompt(context)
    assert "Дата записи: 2026-07-04" in prompt


def test_build_user_context_empty_query_and_empty_db(db_session: Session) -> None:
    user = _create_user(db_session)
    context = build_user_context(db_session, user.id, "", scope="all")
    assert context.snippets == []


def test_build_user_context_no_query_returns_candidates(db_session: Session) -> None:
    user = _create_user(db_session)
    _create_diary(
        db_session,
        user,
        entry_date="2026-07-04",
        title="4 июля",
        content="Body",
    )
    context = build_user_context(db_session, user.id, "", scope="all")
    assert len(context.snippets) == 1
