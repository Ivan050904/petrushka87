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
from app.services.context.orchestrator import build_context


@pytest.fixture()
def db_session(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Session, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'orchestrator.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = session_factory()
    test_settings = replace(
        app_settings,
        context_candidate_limit=500,
        context_snippet_limit=20,
        context_router_multi_scope=True,
        context_date_lookup_enabled=True,
    )
    monkeypatch.setattr("app.services.context.orchestrator.settings", test_settings)
    monkeypatch.setattr("app.services.context.query_intent.settings", test_settings)
    monkeypatch.setattr("app.services.context.retrievers.base.settings", test_settings)
    try:
        yield db
    finally:
        db.close()


def _user(db: Session) -> User:
    user = User(email="orch@test.local", full_name="Test", hashed_password="x")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_orchestrator_multi_scope_merge(db_session: Session) -> None:
    user = _user(db_session)
    db_session.add_all(
        [
            Entry(
                user_id=user.id,
                type="diary",
                title="Diary",
                content="Настроение хорошее.",
                metadata_={"entry_date": "2026-07-04", "mode": "diary"},
            ),
            Entry(
                user_id=user.id,
                type="finance",
                title="Coffee",
                content="Кофе",
                metadata_={
                    "amount": 300,
                    "direction": "expense",
                    "currency": "RUB",
                    "transaction_date": "2026-07-04",
                },
            ),
        ]
    )
    db_session.commit()

    context = build_context(
        db_session,
        user.id,
        "сводка за 4 июля 2026",
        scope="all",
    )
    assert len(context.searched_scopes) >= 1
    assert len(context.snippets) >= 1


def test_orchestrator_dedupes_entries(db_session: Session) -> None:
    user = _user(db_session)
    entry = Entry(
        user_id=user.id,
        type="note",
        title="Same",
        content="Duplicate candidate",
        metadata_={},
    )
    db_session.add(entry)
    db_session.commit()

    context = build_context(db_session, user.id, "Duplicate candidate", scope="all", limit=10)
    ids = [item.entry_id for item in context.snippets if item.entry_id is not None]
    assert len(ids) == len(set(ids))
