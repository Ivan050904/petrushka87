from __future__ import annotations

from collections.abc import Generator
from dataclasses import replace
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings as app_settings
from app.db.base import Base
from app.models.entry import Entry
from app.models.user import User
from app.services.context.query_intent import QueryIntent
from app.services.context.retrievers import finance, kanban, notes


@pytest.fixture()
def db_session(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Session, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'retrievers.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = session_factory()
    test_settings = replace(
        app_settings,
        context_candidate_limit=500,
        context_date_lookup_enabled=True,
    )
    monkeypatch.setattr("app.services.context.retrievers.base.settings", test_settings)
    monkeypatch.setattr("app.services.context.retrievers.notes.settings", test_settings)
    try:
        yield db
    finally:
        db.close()


def _user(db: Session) -> User:
    user = User(email="retriever@test.local", full_name="Test", hashed_password="x")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_notes_retriever_pins_diary_date(db_session: Session) -> None:
    user = _user(db_session)
    db_session.add(
        Entry(
            user_id=user.id,
            type="diary",
            title="4 июля",
            content="Текст дневника.",
            metadata_={"entry_date": "2026-07-04", "mode": "diary", "collection": "life_notes"},
        )
    )
    db_session.commit()

    intent = QueryIntent(scopes=["notes"], matched_dates=["2026-07-04"], confidence=0.9)
    snippets = notes.retrieve(
        db_session,
        user.id,
        "4 июля 2026",
        intent=intent,
        limit=5,
    )
    assert any("Текст дневника" in item.text for item in snippets)


def test_finance_retriever_pins_month(db_session: Session) -> None:
    user = _user(db_session)
    db_session.add(
        Entry(
            user_id=user.id,
            type="finance",
            title="Обед",
            content="Кафе",
            metadata_={
                "amount": 500,
                "direction": "expense",
                "currency": "RUB",
                "transaction_date": "2026-05-12",
            },
        )
    )
    db_session.commit()

    intent = QueryIntent(scopes=["finance"], finance_month="2026-05", confidence=0.9)
    snippets = finance.retrieve(
        db_session,
        user.id,
        "расходы за май",
        intent=intent,
        limit=5,
    )
    assert any("Обед" in item.title for item in snippets)


def test_kanban_retriever_finds_board_card(db_session: Session) -> None:
    user = _user(db_session)
    db_session.add(
        Entry(
            user_id=user.id,
            type="task",
            title="Kanban card",
            content="Implement feature X",
            metadata_={"board_id": "kanban_code", "kanban_column": "doing"},
        )
    )
    db_session.commit()

    intent = QueryIntent(scopes=["kanban"], confidence=0.8)
    snippets = kanban.retrieve(
        db_session,
        user.id,
        "что на доске",
        intent=intent,
        limit=5,
    )
    assert any("Implement feature X" in item.text for item in snippets)
