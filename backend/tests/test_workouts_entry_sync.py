from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings as app_settings
from app.db.base import Base
from app.models.entry import Entry
from app.models.user import User
from app.models.workout import ExerciseCatalog, WorkoutExercise, WorkoutSession
from app.services.context.entity_search import ensure_entries_fts
from app.services.context.query_intent import QueryIntent
from app.services.context.retrievers import workouts
from app.services.embeddings.indexer import index_entry
from app.services.workouts.entry_sync import sync_entry_for_session


@pytest.fixture()
def db_session(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Session, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'workouts_retriever.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    ensure_entries_fts(engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = session_factory()
    test_settings = app_settings
    monkeypatch.setattr("app.services.context.retrievers.base.settings", test_settings)
    try:
        yield db
    finally:
        db.close()


def _user(db: Session) -> User:
    user = User(email="workout@test.local", full_name="Test", hashed_password="x")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_workouts_retriever_finds_session_entry(db_session: Session) -> None:
    user = _user(db_session)
    catalog = ExerciseCatalog(user_id=user.id, name="Присед", muscle_group="legs")
    db_session.add(catalog)
    db_session.flush()

    session = WorkoutSession(
        id=uuid4(),
        user_id=user.id,
        date=datetime(2025, 7, 1, tzinfo=UTC),
        body_weight=75.0,
        mood=7,
        muscle_readiness=7,
        sleep_quality=7,
        general_fatigue=5,
    )
    session.exercises.append(
        WorkoutExercise(
            exercise_catalog_id=catalog.id,
            sets=[{"weight": 80, "reps": 8}],
        )
    )
    db_session.add(session)
    db_session.commit()

    entry = sync_entry_for_session(db_session, session)
    index_entry(db_session, entry)
    db_session.commit()

    intent = QueryIntent(scopes=["workouts"], confidence=0.9)
    snippets = workouts.retrieve(
        db_session,
        user.id,
        "присед",
        intent=intent,
        limit=5,
    )
    assert any("Присед" in item.text for item in snippets)
