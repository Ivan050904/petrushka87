from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.workout import WorkoutSession
from app.schemas.entry import EntryType


@dataclass(frozen=True)
class CatalogBucket:
    label: str
    count: int
    date_from: str | None
    date_to: str | None


def _entry_date_bounds(db: Session, user_id: uuid.UUID, entry_types: set[str]) -> tuple[int, str | None, str | None]:
    statement = select(Entry).where(Entry.user_id == user_id, Entry.type.in_(entry_types))
    entries = db.scalars(statement).all()
    if not entries:
        return 0, None, None

    dates: list[str] = []
    for entry in entries:
        metadata = entry.metadata_ or {}
        entry_date = metadata.get("entry_date") or metadata.get("session_date") or metadata.get("transaction_date")
        if isinstance(entry_date, str) and entry_date.strip():
            dates.append(entry_date.strip()[:10])
        else:
            dates.append(entry.created_at.date().isoformat())

    dates.sort()
    return len(entries), dates[0], dates[-1]


def _workout_bounds(db: Session, user_id: uuid.UUID) -> tuple[int, str | None, str | None]:
    count = db.scalar(
        select(func.count()).select_from(WorkoutSession).where(WorkoutSession.user_id == user_id)
    )
    if not count:
        return 0, None, None
    rows = db.scalars(
        select(WorkoutSession.date)
        .where(WorkoutSession.user_id == user_id)
        .order_by(WorkoutSession.date.asc())
    ).all()
    if not rows:
        return int(count), None, None
    first = rows[0].date().isoformat() if hasattr(rows[0], "date") else str(rows[0])[:10]
    last = rows[-1].date().isoformat() if hasattr(rows[-1], "date") else str(rows[-1])[:10]
    return int(count), first, last


def build_user_data_catalog(db: Session, user_id: uuid.UUID) -> str:
    buckets: list[CatalogBucket] = []

    notes_count, notes_from, notes_to = _entry_date_bounds(
        db, user_id, {EntryType.note.value, EntryType.diary.value}
    )
    buckets.append(CatalogBucket("заметок и дневника", notes_count, notes_from, notes_to))

    therapy_count, therapy_from, therapy_to = _entry_date_bounds(db, user_id, {EntryType.therapy_session.value})
    buckets.append(CatalogBucket("сессий терапии", therapy_count, therapy_from, therapy_to))

    transcription_count, transcription_from, transcription_to = _entry_date_bounds(
        db, user_id, {EntryType.transcription.value, EntryType.resource.value}
    )
    buckets.append(CatalogBucket("транскрипций", transcription_count, transcription_from, transcription_to))

    finance_count, finance_from, finance_to = _entry_date_bounds(db, user_id, {EntryType.finance.value})
    buckets.append(CatalogBucket("финансовых записей", finance_count, finance_from, finance_to))

    people_count, _, _ = _entry_date_bounds(db, user_id, {EntryType.person.value})
    buckets.append(CatalogBucket("контактов", people_count, None, None))

    workout_count, workout_from, workout_to = _workout_bounds(db, user_id)
    buckets.append(CatalogBucket("тренировок", workout_count, workout_from, workout_to))

    plans_count, plans_from, plans_to = _entry_date_bounds(
        db,
        user_id,
        {EntryType.task.value, EntryType.event.value, EntryType.reminder.value},
    )
    buckets.append(CatalogBucket("задач и событий", plans_count, plans_from, plans_to))

    parts: list[str] = []
    for bucket in buckets:
        if bucket.count <= 0:
            continue
        if bucket.date_from and bucket.date_to:
            parts.append(f"{bucket.count} {bucket.label} ({bucket.date_from}–{bucket.date_to})")
        else:
            parts.append(f"{bucket.count} {bucket.label}")

    if not parts:
        return "У пользователя пока нет сохранённых данных в системе."
    return "У пользователя: " + "; ".join(parts) + "."
