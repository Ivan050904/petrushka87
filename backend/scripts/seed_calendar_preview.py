from __future__ import annotations

import sys
from datetime import datetime, time, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.models.entry import Entry  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.entry import EntryType  # noqa: E402
from app.schemas.metadata import normalize_metadata  # noqa: E402

PREVIEW_MARKER = "calendar-preview-v1"


def _today() -> datetime:
    return datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)


def _datetime_offset(days: int, hour: int, minute: int = 0) -> str:
    target = _today() + timedelta(days=days)
    return target.replace(hour=hour, minute=minute).strftime("%Y-%m-%dT%H:%M")


def _iso_weekday(day_offset: int) -> int:
    date = (_today() + timedelta(days=day_offset)).date()
    return ((date.weekday()) % 7) + 1  # Mon=1 in our schema uses isoWeekday from habits: ((getDay()+6)%7)+1
    # Python weekday: Mon=0, so iso = weekday+1


def _build_specs() -> list[dict]:
    specs: list[dict] = []

    day_labels = {0: "сегодня", 1: "завтра", 2: "послезавтра"}

    for offset, label in day_labels.items():
        specs.append(
            {
                "type": EntryType.task,
                "title": f"[Демо] Созвон — {label}",
                "content": f"Тестовая задача на {label} для просмотра календаря.",
                "metadata": {
                    "status": "active",
                    "priority": "high",
                    "scheduled_at": _datetime_offset(offset, 10, 0),
                    "project": "Календарь-демо",
                    "preview_seed": PREVIEW_MARKER,
                },
            }
        )
        specs.append(
            {
                "type": EntryType.task,
                "title": f"[Демо] Спорт — {label}",
                "content": f"Вечерняя тренировка ({label}).",
                "metadata": {
                    "status": "active",
                    "priority": "medium",
                    "scheduled_at": _datetime_offset(offset, 19, 0),
                    "project": "Календарь-демо",
                    "preview_seed": PREVIEW_MARKER,
                },
            }
        )
        specs.append(
            {
                "type": EntryType.event,
                "title": f"[Демо] Встреча — {label}",
                "content": f"Событие на {label} в календаре.",
                "metadata": {
                    "starts_at": _datetime_offset(offset, 14, 0),
                    "ends_at": _datetime_offset(offset, 15, 30),
                    "location": "Zoom",
                    "status": "tracking",
                    "preview_seed": PREVIEW_MARKER,
                },
            }
        )

    today_weekday = _iso_weekday(0)
    tomorrow_weekday = _iso_weekday(1)
    recurring_weekdays = sorted({today_weekday, tomorrow_weekday, ((today_weekday) % 7) + 1})

    specs.append(
        {
            "type": EntryType.task,
            "title": "[Демо] Еженедельная планёрка",
            "content": "Повторяется каждую неделю в выбранные дни.",
            "metadata": {
                "status": "active",
                "priority": "medium",
                "project": "Календарь-демо",
                "preview_seed": PREVIEW_MARKER,
                "recurrence": {
                    "kind": "weekly",
                    "weekdays": recurring_weekdays if len(recurring_weekdays) >= 2 else [1, 3, 5],
                    "time": "09:00",
                },
                "recurrence_exceptions": {},
                "skipped_weeks": [],
            },
        }
    )
    specs.append(
        {
            "type": EntryType.task,
            "title": "[Демо] Йога по утрам",
            "content": "Еженедельное повторение Пн/Ср/Пт.",
            "metadata": {
                "status": "active",
                "priority": "low",
                "project": "Календарь-демо",
                "preview_seed": PREVIEW_MARKER,
                "recurrence": {
                    "kind": "weekly",
                    "weekdays": [1, 3, 5],
                    "time": "07:30",
                },
                "recurrence_exceptions": {},
                "skipped_weeks": [],
            },
        }
    )

    return specs


def _clear_preview_entries(db, user_id) -> int:
    entries = db.scalars(
        select(Entry).where(
            Entry.user_id == user_id,
            Entry.type.in_(["task", "event"]),
            Entry.title.like("[Демо]%"),
        )
    ).all()
    removed = 0
    for entry in entries:
        db.delete(entry)
        removed += 1
    return removed


def seed_calendar_preview(*, email: str | None = None) -> int:
    specs = _build_specs()
    with SessionLocal() as db:
        query = select(User)
        if email:
            query = query.where(User.email == email)
        users = db.scalars(query).all()
        if not users:
            raise RuntimeError("No users found in database.")

        created = 0
        for user in users:
            _clear_preview_entries(db, user.id)
            for spec in specs:
                metadata = normalize_metadata(spec["type"], spec["metadata"])
                db.add(
                    Entry(
                        user_id=user.id,
                        type=spec["type"].value,
                        title=spec["title"],
                        content=spec["content"],
                        metadata_=metadata,
                    )
                )
                created += 1
        db.commit()
        return created


def main() -> int:
    count = seed_calendar_preview()
    print(f"Created {count} calendar preview entries for all users.")
    print("Open /plans -> Calendar to review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
