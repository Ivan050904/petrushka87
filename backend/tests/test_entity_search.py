from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.entry import Entry
from app.models.user import User
from app.models.workout import ExerciseCatalog, WorkoutExercise, WorkoutSession
from app.schemas.entry import EntryType
from app.services.context.entity_search import ensure_entries_fts, search_entity_mentions
from app.services.context.entity_query import extract_entity_name, is_entity_timeline_query
from app.services.context.orchestrator import build_context
from app.services.context.query_intent import route_query
from app.services.workouts.entry_sync import build_workout_rag_text, sync_entry_for_session


@pytest.fixture()
def db_session(tmp_path: Path) -> Generator[Session, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'entity.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    ensure_entries_fts(engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


def _user(db: Session) -> User:
    user = User(email="entity@test.local", full_name="Test", hashed_password="x")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_entity_search_finds_mentions_across_years(db_session: Session) -> None:
    user = _user(db_session)
    db_session.add_all(
        [
            Entry(
                user_id=user.id,
                type="note",
                title="2021",
                content="Встреча с Верой в кафе.",
                metadata_={"entry_date": "2021-03-10"},
            ),
            Entry(
                user_id=user.id,
                type="diary",
                title="2025",
                content="Снова думал про Веру.",
                metadata_={"entry_date": "2025-06-01", "mode": "diary"},
            ),
            Entry(
                user_id=user.id,
                type="note",
                title="Noise",
                content="Погода была солнечной.",
                metadata_={"entry_date": "2025-06-02"},
            ),
        ]
    )
    db_session.commit()

    hits = search_entity_mentions(db_session, user.id, ["Вера", "Веру", "Верой"])
    assert len(hits) == 2
    years = sorted(hit.entry_date[:4] for hit in hits if hit.entry_date)
    assert years == ["2021", "2025"]


def test_extract_entity_name_from_notes_query() -> None:
    assert extract_entity_name("найди в заметках упоминание про Веру") == "Веру"


def test_is_entity_timeline_for_notes_query() -> None:
    query = "найди в заметках упоминание про Веру"
    assert is_entity_timeline_query(query)
    intent = route_query(query)
    assert intent.retrieval_mode == "entity_timeline"
    assert intent.scopes == ["notes"]


def test_build_context_entity_timeline_includes_full_text(db_session: Session) -> None:
    user = _user(db_session)
    long_text = "Про Веру: " + ("важная деталь. " * 300)
    db_session.add(
        Entry(
            user_id=user.id,
            type="note",
            title="Заметка про Веру",
            content=long_text,
            metadata_={"entry_date": "2024-01-15"},
        )
    )
    db_session.commit()

    context = build_context(db_session, user.id, "что есть про Веру")
    assert context.retrieval_mode == "entity_timeline"
    assert context.snippets
    assert "важная деталь" in context.snippets[0].text
    assert len(context.snippets[0].text) < 4000
    assert context.catalog_summary is not None
    assert context.entity_year_counts.get("2024") == 1


def test_workout_entry_sync_and_rag_text(db_session: Session) -> None:
    user = _user(db_session)
    catalog = ExerciseCatalog(user_id=user.id, name="Жим лёжа", muscle_group="chest")
    db_session.add(catalog)
    db_session.flush()

    session = WorkoutSession(
        id=uuid4(),
        user_id=user.id,
        date=datetime(2025, 7, 12, tzinfo=UTC),
        body_weight=80.0,
        mood=8,
        muscle_readiness=7,
        sleep_quality=6,
        general_fatigue=4,
    )
    session.exercises.append(
        WorkoutExercise(
            exercise_catalog_id=catalog.id,
            sets=[{"weight": 100, "reps": 5}, {"weight": 110, "reps": 3}],
        )
    )
    db_session.add(session)
    db_session.commit()

    text = build_workout_rag_text(session)
    assert "Жим лёжа" in text
    assert "100×5" in text

    entry = sync_entry_for_session(db_session, session)
    db_session.commit()
    assert entry.type == EntryType.workout.value
    assert session.entry_id == entry.id
    assert entry.metadata_["collection"] == "workouts"
