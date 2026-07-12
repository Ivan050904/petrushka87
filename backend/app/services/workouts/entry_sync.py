from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.workout import WorkoutExercise, WorkoutSession
from app.schemas.entry import EntryType
from app.services.context.entry_rag_text import format_russian_date


def _session_iso_date(session: WorkoutSession) -> str:
    session_date = session.date
    if isinstance(session_date, datetime):
        return session_date.date().isoformat()
    return session_date.isoformat()


def _format_session_title(session: WorkoutSession) -> str:
    iso_date = _session_iso_date(session)
    try:
        label = format_russian_date(iso_date)
    except ValueError:
        label = iso_date
    title = f"Тренировка {label}"
    return title[:157] + "..." if len(title) > 160 else title


def _format_set_line(raw_set: dict) -> str:
    weight = raw_set.get("weight")
    reps = raw_set.get("reps")
    if weight is None or reps is None:
        return ""
    return f"{weight}×{reps}"


def build_workout_rag_text(session: WorkoutSession) -> str:
    parts: list[str] = []
    iso_date = _session_iso_date(session)
    parts.append(f"Дата: {iso_date}")
    try:
        parts.append(format_russian_date(iso_date))
    except ValueError:
        pass

    parts.append(f"Вес тела: {session.body_weight} кг")
    parts.append(f"Настроение: {session.mood}/10")
    parts.append(f"Готовность мышц: {session.muscle_readiness}/10")
    parts.append(f"Качество сна: {session.sleep_quality}/10")
    parts.append(f"Общая усталость: {session.general_fatigue}/10")

    exercises: list[WorkoutExercise] = list(session.exercises or [])
    if exercises:
        parts.append("Упражнения:")
        for item in exercises:
            catalog = item.exercise
            name = catalog.name if catalog is not None else "Упражнение"
            group = catalog.muscle_group if catalog is not None else ""
            sets_text = ", ".join(
                line for line in (_format_set_line(raw) for raw in (item.sets or [])) if line
            )
            line = f"- {name}"
            if group:
                line += f" ({group})"
            if sets_text:
                line += f": {sets_text}"
            parts.append(line)

    return "\n".join(parts)


def sync_entry_for_session(db: Session, session: WorkoutSession) -> Entry:
    title = _format_session_title(session)
    content = build_workout_rag_text(session)[:50000]
    entry_date = _session_iso_date(session)
    metadata = {
        "workout_session_id": str(session.id),
        "entry_date": entry_date,
        "collection": "workouts",
        "body_weight": session.body_weight,
        "mood": session.mood,
        "muscle_readiness": session.muscle_readiness,
        "sleep_quality": session.sleep_quality,
        "general_fatigue": session.general_fatigue,
    }

    entry: Entry | None = None
    if session.entry_id is not None:
        entry = db.get(Entry, session.entry_id)

    if entry is None:
        entry = Entry(
            user_id=session.user_id,
            type=EntryType.workout.value,
            title=title,
            content=content,
            metadata_=metadata,
        )
        db.add(entry)
        db.flush()
        session.entry_id = entry.id
        return entry

    entry.type = EntryType.workout.value
    entry.title = title
    entry.content = content
    entry.metadata_ = {**entry.metadata_, **metadata}
    db.add(entry)
    return entry
