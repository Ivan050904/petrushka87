from __future__ import annotations

import argparse
import random
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import delete, select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.models.entry import Entry  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.entry import EntryType  # noqa: E402
from app.schemas.metadata import normalize_metadata  # noqa: E402

SEED_MARKER = "folio-one-reference-people-v1"
DEFAULT_EMAIL = "finance@folio-one.local"
RNG = random.Random(20260713)

# full_name, description, birthday, contacts
PEOPLE_SPECS: list[tuple[str, str, str, list[dict[str, str]]]] = [
    (
        "Алексей Воронов",
        "Тимлид в продуктовой команде",
        "1985-03-14",
        [
            {"type": "email", "value": "voronov@company.io"},
            {"type": "telegram", "value": "@voronov"},
        ],
    ),
    (
        "Мария Иванова",
        "Product designer, помогает с UI",
        "1992-07-22",
        [
            {"type": "telegram", "value": "@masha_design"},
            {"type": "email", "value": "masha@studio.ru"},
        ],
    ),
    (
        "Дмитрий Козлов",
        "Backend-разработчик",
        "1995-11-03",
        [
            {"type": "telegram", "value": "@kozlov"},
            {"type": "email", "value": "d.kozlov@dev.ru"},
        ],
    ),
    (
        "Анна Смирнова",
        "Ментор по карьере",
        "1988-01-19",
        [{"type": "email", "value": "anna@mentor.ru"}],
    ),
    (
        "Игорь Петров",
        "Коллега по проекту Folio",
        "1990-09-08",
        [{"type": "telegram", "value": "@igor_p"}],
    ),
    (
        "Елена Волкова",
        "HR в стартапе",
        "1987-05-30",
        [
            {"type": "email", "value": "elena@startup.io"},
            {"type": "phone", "value": "+7 916 555-12-34"},
        ],
    ),
    (
        "Павел Орлов",
        "Друг с университета",
        "1994-12-12",
        [
            {"type": "telegram", "value": "@pavel_o"},
            {"type": "phone", "value": "+7 900 123-45-67"},
        ],
    ),
    (
        "Ольга Никитина",
        "Нутрициолог",
        "1991-04-17",
        [{"type": "telegram", "value": "@olya_nutri"}],
    ),
    (
        "София Романова",
        "Психолог, очные сессии раз в две недели",
        "1993-07-15",
        [
            {"type": "email", "value": "sofia.romanova@therapy.ru"},
            {"type": "phone", "value": "+7 903 777-88-99"},
        ],
    ),
    (
        "Никита Белов",
        "Фитнес-тренер",
        "1989-07-28",
        [{"type": "telegram", "value": "@nikita_fit"}],
    ),
    (
        "Катя Морозова",
        "Соседка, иногда сидит с котом",
        "1996-08-03",
        [{"type": "phone", "value": "+7 925 444-33-22"}],
    ),
    (
        "Виктор Лебедев",
        "Бухгалтер ИП",
        "1982-08-10",
        [{"type": "email", "value": "v.lebedev@accounting.ru"}],
    ),
    (
        "Татьяна Кузнецова",
        "Мама",
        "1965-02-08",
        [{"type": "phone", "value": "+7 910 111-22-33"}],
    ),
    (
        "Артём Соколов",
        "Знакомый фотограф",
        "1991-10-21",
        [
            {"type": "telegram", "value": "@artem_photo"},
            {"type": "email", "value": "artem@sokolov.photo"},
        ],
    ),
]


@dataclass(frozen=True)
class SeedPeopleResult:
    email: str
    created: int
    deleted: int
    total: int


def _parse_name(full_name: str) -> tuple[str, str, str]:
    parts = full_name.split()
    if len(parts) >= 3:
        return parts[0], parts[1], " ".join(parts[2:])
    if len(parts) == 2:
        return parts[0], parts[1], ""
    return "", full_name, ""


def _utc_created(day_offset: int, hour: int) -> datetime:
    day = datetime.now(UTC).date() + timedelta(days=day_offset)
    return datetime.combine(day, time(hour, RNG.randint(0, 59)), tzinfo=UTC)


def _get_user(db, email: str) -> User:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        raise RuntimeError(f"User not found: {email}")
    return user


def _clear_seeded_people(db, user_id: uuid.UUID) -> int:
    rows = db.scalars(
        select(Entry).where(Entry.user_id == user_id, Entry.type == EntryType.person.value),
    ).all()
    deleted = 0
    for row in rows:
        marker = (row.metadata_ or {}).get("demo_seed")
        if marker == SEED_MARKER:
            db.delete(row)
            deleted += 1
    return deleted


def seed_reference_people(db, user: User, *, reset: bool = False) -> SeedPeopleResult:
    deleted = _clear_seeded_people(db, user) if reset else 0
    if deleted:
        db.commit()

    seeded_count = len(
        list(
            db.scalars(
                select(Entry).where(
                    Entry.user_id == user.id,
                    Entry.type == EntryType.person.value,
                ),
            ).all()
        )
    )
    has_seeded = any(
        (row.metadata_ or {}).get("demo_seed") == SEED_MARKER
        for row in db.scalars(
            select(Entry).where(Entry.user_id == user.id, Entry.type == EntryType.person.value),
        ).all()
    )
    if has_seeded and not reset:
        return SeedPeopleResult(email=user.email, created=0, deleted=0, total=seeded_count)

    created = 0
    for index, (full_name, description, birthday, contact_items) in enumerate(PEOPLE_SPECS):
        last_name, first_name, middle_name = _parse_name(full_name)
        metadata = normalize_metadata(
            EntryType.person,
            {
                "last_name": last_name,
                "first_name": first_name,
                "middle_name": middle_name or None,
                "full_name": full_name,
                "description": description,
                "birthday": birthday,
                "contact_items": contact_items,
                "notes": description,
                "demo_seed": SEED_MARKER,
            },
        )
        created_at = _utc_created(day_offset=-30 + index, hour=10 + (index % 6))
        db.add(
            Entry(
                user_id=user.id,
                type=EntryType.person.value,
                title=full_name,
                content=description,
                metadata_=metadata,
                created_at=created_at,
                updated_at=created_at,
            )
        )
        created += 1

    db.commit()

    total = len(
        list(
            db.scalars(
                select(Entry).where(Entry.user_id == user.id, Entry.type == EntryType.person.value),
            ).all()
        )
    )
    return SeedPeopleResult(email=user.email, created=created, deleted=deleted, total=total)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed reference people for a user account.")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help=f"Target user email (default: {DEFAULT_EMAIL})")
    parser.add_argument("--reset", action="store_true", help="Remove previously seeded people and recreate.")
    args = parser.parse_args()

    with SessionLocal() as db:
        user = _get_user(db, args.email)
        result = seed_reference_people(db, user, reset=args.reset)

    if result.created == 0 and not args.reset:
        print(f"People already exist for {result.email} ({result.total} total). Use --reset to recreate.")
    else:
        if result.deleted:
            print(f"Removed seeded people: {result.deleted}")
        print(f"Created people: {result.created}")
        print(f"Total people for {result.email}: {result.total}")
        print("Open: /reference?tab=people")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
