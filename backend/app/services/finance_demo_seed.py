from __future__ import annotations

import random
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.entry import Entry
from app.models.user import User
from app.schemas.entry import EntryType
from app.schemas.metadata import normalize_metadata
from app.services.security import get_password_hash

FINANCE_DEMO_EMAIL = "finance@folio-one.local"
FINANCE_DEMO_PASSWORD = "finance12345"
FINANCE_DEMO_FULL_NAME = "Финансы Демо"
FINANCE_DEMO_SEED_MARKER = "folio-one-finance-demo-v2"
PETR_SOURCE_EMAIL = "petr@petr.local"

RNG = random.Random(20260712)


@dataclass(frozen=True)
class FinanceDemoSeedResult:
    email: str
    password: str
    full_name: str
    created_user: bool
    finance_entries: int
    workout_sessions: int
    category_count: int
    skipped: bool

    @property
    def entries_created(self) -> int:
        return self.finance_entries + self.workout_sessions

    @property
    def entries_total(self) -> int:
        return self.entries_created


EXPENSE_TEMPLATES: list[tuple[str, str, str, tuple[int, int]]] = [
    ("Пятёрочка", "Продукты", "Пятёрочка", (890, 4200)),
    ("Перекрёсток", "Продукты", "Перекрёсток", (1200, 5800)),
    ("ВкусВилл", "Продукты", "ВкусВилл", (650, 3100)),
    ("Метро", "Транспорт", "Московский метрополитен", (65, 65)),
    ("Яндекс Go", "Транспорт", "Яндекс Go", (280, 890)),
    ("Кофе", "Рестораны", "Surf Coffee", (320, 480)),
    ("Обед", "Рестораны", "Столовая", (420, 780)),
    ("Ужин", "Рестораны", "Тануки", (980, 2400)),
    ("Spotify", "Подписки", "Spotify", (269, 269)),
    ("iCloud", "Подписки", "Apple", (149, 149)),
    ("Интернет", "Жильё", "Ростелеком", (900, 900)),
    ("ЖКХ", "Жильё", "ЕИРЦ", (4200, 6800)),
    ("Аптека", "Здоровье", "36,6", (340, 2100)),
    ("Ozon", "Покупки", "Ozon", (590, 8900)),
    ("Wildberries", "Покупки", "Wildberries", (780, 5200)),
    ("Спортзал", "Здоровье", "World Class", (3500, 3500)),
    ("Бензин", "Транспорт", "Лукойл", (1800, 4200)),
    ("Кино", "Покупки", "Кинотеатр", (680, 1200)),
    ("Цветы", "Покупки", "Flowwow", (1500, 3500)),
    ("Суши Wok", "Рестораны", "Суши Wok", (890, 1900)),
]

INCOME_TEMPLATES: list[tuple[str, str, str, tuple[int, int]]] = [
    ("Зарплата", "Доход", "ООО ТехСтарт", (118000, 125000)),
    ("Аванс", "Доход", "ООО ТехСтарт", (72000, 82000)),
    ("Фриланс", "Доход", "ИП Сидоров", (12000, 45000)),
    ("Кэшбэк", "Доход", "Т‑Банк", (180, 2400)),
    ("Возврат", "Доход", "Ozon", (390, 3200)),
]


def _utc_from_date(day: date, hour: int = 12, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=UTC)


def _add_finance_entry(
    db: Session,
    *,
    user_id: uuid.UUID,
    title: str,
    description: str,
    amount: float,
    direction: str,
    category: str,
    transaction_date: date,
    counterparty: str | None = None,
    bank: str = "tinkoff",
    hour: int = 12,
) -> Entry:
    metadata = normalize_metadata(
        EntryType.finance,
        {
            "amount": round(amount, 2),
            "direction": direction,
            "kind": direction,
            "currency": "RUB",
            "description": description,
            "category": category,
            "transaction_date": transaction_date.isoformat(),
            "counterparty": counterparty,
            "bank": bank,
            "external_id": f"finance-demo-{transaction_date.isoformat()}-{title}-{amount}-{RNG.randint(1, 99999)}",
            "demo_seed": FINANCE_DEMO_SEED_MARKER,
        },
    )
    created_at = _utc_from_date(transaction_date, hour, RNG.randint(0, 59))
    entry = Entry(
        user_id=user_id,
        type=EntryType.finance.value,
        title=title,
        content=description,
        metadata_=metadata,
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(entry)
    return entry


def _pick_amount(range_pair: tuple[int, int]) -> float:
    low, high = range_pair
    if low == high:
        return float(low)
    step = 10 if high - low > 500 else 1
    value = RNG.randint(low // step, high // step) * step
    return float(value)


def _month_days(year: int, month: int, through_day: int | None = None) -> list[date]:
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    last_day = (next_month - timedelta(days=1)).day
    end_day = min(last_day, through_day or last_day)
    return [date(year, month, day) for day in range(1, end_day + 1)]


def _generate_month_transactions(year: int, month: int, *, through_day: int | None = None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    days = _month_days(year, month, through_day)

    def add(
        day: int,
        title: str,
        description: str,
        amount: float,
        direction: str,
        category: str,
        counterparty: str | None = None,
        hour: int = 12,
    ) -> None:
        if day > len(days):
            return
        items.append(
            {
                "transaction_date": days[day - 1],
                "title": title,
                "description": description,
                "amount": amount,
                "direction": direction,
                "category": category,
                "counterparty": counterparty,
                "hour": hour,
            }
        )

    add(1, "Аренда квартиры", "Перевод арендодателю", 48000, "expense", "Жильё", "Арендодатель", 9)
    add(5, "Зарплата", "Основная выплата за месяц", _pick_amount((118000, 125000)), "income", "Доход", "ООО ТехСтарт", 10)
    add(20, "Аванс", "Аванс по зарплате", _pick_amount((72000, 82000)), "income", "Доход", "ООО ТехСтарт", 10)
    add(3, "Интернет", "Домашний интернет", 900, "expense", "Жильё", "Ростелеком", 11)
    add(8, "Spotify", "Семейная подписка", 269, "expense", "Подписки", "Spotify", 8)
    add(10, "Спортзал", "Абонемент", 3500, "expense", "Здоровье", "World Class", 7)

    for day in days:
        weekday = day.weekday()
        if weekday < 5:
            add(day.day, "Метро", "Пополнение «Тройки»", 65, "expense", "Транспорт", "Московский метрополитен", 8)
        if day.day % 3 == 0:
            template = RNG.choice(EXPENSE_TEMPLATES[:3])
            add(
                day.day,
                template[0],
                f"Покупка в {template[2]}",
                _pick_amount(template[3]),
                "expense",
                template[1],
                template[2],
                RNG.randint(11, 20),
            )
        if weekday >= 5 and day.day % 2 == 0:
            template = RNG.choice(EXPENSE_TEMPLATES[5:8])
            add(
                day.day,
                template[0],
                template[0],
                _pick_amount(template[3]),
                "expense",
                template[1],
                template[2],
                RNG.randint(13, 21),
            )
        if day.day % 7 == 0:
            template = RNG.choice(EXPENSE_TEMPLATES[13:15])
            add(
                day.day,
                template[0],
                f"Заказ на {template[2]}",
                _pick_amount(template[3]),
                "expense",
                template[1],
                template[2],
                RNG.randint(15, 22),
            )

    extra_count = RNG.randint(8, 14)
    for _ in range(extra_count):
        day = RNG.choice(days)
        template = RNG.choice(EXPENSE_TEMPLATES)
        add(
            day.day,
            template[0],
            template[0],
            _pick_amount(template[3]),
            "expense",
            template[1],
            template[2],
            RNG.randint(9, 22),
        )

    if month % 2 == 0:
        add(15, "Фриланс", "Вёрстка лендинга", _pick_amount((18000, 42000)), "income", "Доход", "ИП Сидоров", 14)
    if RNG.random() > 0.4:
        add(25, "Кэшбэк", "Кэшбэк по карте", _pick_amount((180, 2400)), "income", "Доход", "Т‑Банк", 16)

    return items


def _build_finance_specs(*, july_through_day: int = 12) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    months: list[tuple[int, int, int | None]] = [
        (2025, 8, None),
        (2025, 9, None),
        (2025, 10, None),
        (2025, 11, None),
        (2025, 12, None),
        (2026, 1, None),
        (2026, 2, None),
        (2026, 3, None),
        (2026, 4, None),
        (2026, 5, None),
        (2026, 6, None),
        (2026, 7, july_through_day),
    ]
    for year, month, through_day in months:
        specs.extend(_generate_month_transactions(year, month, through_day=through_day))
    return specs


def _ensure_user(db: Session) -> tuple[User, bool]:
    email = FINANCE_DEMO_EMAIL.lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        user.full_name = FINANCE_DEMO_FULL_NAME
        user.hashed_password = get_password_hash(FINANCE_DEMO_PASSWORD)
        db.add(user)
        db.flush()
        return user, False

    user = User(
        email=email,
        full_name=FINANCE_DEMO_FULL_NAME,
        hashed_password=get_password_hash(FINANCE_DEMO_PASSWORD),
    )
    db.add(user)
    db.flush()
    return user, True


def _entry_count(db: Session, user_id: uuid.UUID) -> int:
    return int(db.scalar(select(func.count()).select_from(Entry).where(Entry.user_id == user_id)) or 0)


def _clear_user_entries(db: Session, user_id: uuid.UUID) -> None:
    db.execute(delete(Entry).where(Entry.user_id == user_id))


def seed_finance_demo_entries(db: Session, user: User, *, july_through_day: int = 12) -> int:
    specs = _build_finance_specs(july_through_day=july_through_day)
    for spec in specs:
        _add_finance_entry(
            db,
            user_id=user.id,
            title=spec["title"],
            description=spec["description"],
            amount=spec["amount"],
            direction=spec["direction"],
            category=spec["category"],
            transaction_date=spec["transaction_date"],
            counterparty=spec.get("counterparty"),
            hour=spec.get("hour", 12),
        )
    return len(specs)


def _utc_from_transaction_date(value: str, hour: int = 12, minute: int = 0) -> datetime:
    if "T" in value or " " in value:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    day = date.fromisoformat(value[:10])
    return datetime.combine(day, time(hour, minute), tzinfo=UTC)


def _get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.strip().lower()))


def _clear_finance_entries(db: Session, user_id: uuid.UUID) -> None:
    db.execute(delete(Entry).where(Entry.user_id == user_id, Entry.type == EntryType.finance.value))


def _clear_workout_data(db: Session, user_id: uuid.UUID) -> None:
    from app.models.workout import ExerciseCatalog, PersonalRecord, WorkoutSession

    session_rows = db.scalars(select(WorkoutSession).where(WorkoutSession.user_id == user_id)).all()
    entry_ids = {row.entry_id for row in session_rows if row.entry_id is not None}
    workout_entries = db.scalars(
        select(Entry.id).where(Entry.user_id == user_id, Entry.type == EntryType.workout.value),
    ).all()
    entry_ids.update(workout_entries)

    db.execute(delete(WorkoutSession).where(WorkoutSession.user_id == user_id))
    db.execute(delete(PersonalRecord).where(PersonalRecord.user_id == user_id))
    db.execute(delete(ExerciseCatalog).where(ExerciseCatalog.user_id == user_id))
    for entry_id in entry_ids:
        db.execute(delete(Entry).where(Entry.id == entry_id, Entry.user_id == user_id))


def copy_finance_from_user(db: Session, *, source: User, target: User) -> tuple[int, int]:
    source_entries = db.scalars(
        select(Entry).where(Entry.user_id == source.id, Entry.type == EntryType.finance.value),
    ).all()

    categories: set[str] = set()
    created = 0

    for source_entry in source_entries:
        metadata = dict(source_entry.metadata_ or {})
        category = metadata.get("category")
        if isinstance(category, str) and category.strip():
            categories.add(category.strip())

        external_id = metadata.get("external_id")
        metadata["external_id"] = f"finance-demo-{external_id or source_entry.id}"
        metadata["demo_seed"] = FINANCE_DEMO_SEED_MARKER
        metadata["source_user"] = source.email
        normalized = normalize_metadata(EntryType.finance, metadata)

        transaction_date = metadata.get("transaction_date")
        if isinstance(transaction_date, str) and transaction_date.strip():
            created_at = _utc_from_transaction_date(transaction_date, hour=RNG.randint(8, 21), minute=RNG.randint(0, 59))
        else:
            created_at = source_entry.created_at

        db.add(
            Entry(
                user_id=target.id,
                type=EntryType.finance.value,
                title=source_entry.title,
                content=source_entry.content,
                metadata_=normalized,
                created_at=created_at,
                updated_at=created_at,
            )
        )
        created += 1

    return created, len(categories)


WORKOUT_CATALOG: list[tuple[str, str, list[tuple[int, int]]]] = [
    ("Присед со штангой", "legs", [(60, 10), (80, 8), (95, 6), (110, 4)]),
    ("Жим лёжа", "chest", [(50, 10), (65, 8), (75, 6), (82.5, 4)]),
    ("Тяга штанги в наклоне", "back", [(40, 10), (55, 8), (65, 6), (70, 5)]),
    ("Жим стоя", "shoulders", [(30, 10), (40, 8), (45, 6)]),
    ("Подтягивания", "back", [(5, 8), (10, 10), (15, 6)]),
    ("Сгибание на бицепс", "biceps", [(14, 12), (16, 10), (18, 8)]),
    ("Французский жим", "triceps", [(20, 12), (25, 10), (27.5, 8)]),
    ("Румынская тяга", "legs", [(50, 10), (60, 8), (70, 6)]),
]


def _scale_sets(base_sets: list[tuple[int, int]], progress: float) -> list[dict[str, int | float]]:
    scaled: list[dict[str, int | float]] = []
    for weight, reps in base_sets:
        next_weight = round(weight * progress, 1)
        if next_weight <= 0:
            next_weight = max(weight, 1.0)
        scaled.append({"weight": next_weight, "reps": reps})
    return scaled


def seed_workout_demo(db: Session, user: User, *, days_back: int = 90) -> int:
    from app.models.workout import ExerciseCatalog, PersonalRecord, WorkoutExercise, WorkoutSession
    from app.services.workouts.entry_sync import sync_entry_for_session

    catalog_items: list[ExerciseCatalog] = []
    for name, muscle_group, _ in WORKOUT_CATALOG:
        item = ExerciseCatalog(user_id=user.id, name=name, muscle_group=muscle_group)
        db.add(item)
        catalog_items.append(item)
    db.flush()

    today = date.today()
    session_dates: list[date] = []
    cursor = today - timedelta(days=days_back)
    while cursor <= today:
        if cursor.weekday() in {0, 2, 4, 5}:
            session_dates.append(cursor)
        cursor += timedelta(days=1)

    if session_dates and session_dates[-1] != today:
        session_dates.append(today)

    created_sessions = 0
    total_sessions = max(len(session_dates), 1)

    by_name = {name: base_sets for name, _, base_sets in WORKOUT_CATALOG}
    for index, session_day in enumerate(session_dates):
        progress = 0.88 + (index / total_sessions) * 0.18
        body_weight = round(78.4 - (index / total_sessions) * 2.6, 1)
        mood = RNG.randint(6, 9)
        muscle_readiness = RNG.randint(5, 9)
        sleep_quality = RNG.randint(5, 9)
        general_fatigue = RNG.randint(3, 7)

        session = WorkoutSession(
            user_id=user.id,
            date=datetime.combine(session_day, time(RNG.randint(7, 20), RNG.randint(0, 59)), tzinfo=UTC),
            body_weight=body_weight,
            mood=mood,
            muscle_readiness=muscle_readiness,
            sleep_quality=sleep_quality,
            general_fatigue=general_fatigue,
        )
        db.add(session)
        db.flush()

        exercise_pool = catalog_items.copy()
        RNG.shuffle(exercise_pool)
        for catalog_item in exercise_pool[:4]:
            base_sets = by_name.get(catalog_item.name, [(40, 10), (50, 8)])
            session.exercises.append(
                WorkoutExercise(
                    exercise_catalog_id=catalog_item.id,
                    sets=_scale_sets(base_sets, progress),
                )
            )

        sync_entry_for_session(db, session)
        created_sessions += 1

        if index % 4 == 0 and catalog_items:
            main_lift = catalog_items[index % len(catalog_items)]
            base_sets = by_name.get(main_lift.name, [(40, 10), (50, 8)])
            best_set = max(base_sets, key=lambda item: item[0])
            record_weight = round(best_set[0] * progress, 1)
            if record_weight <= 0:
                record_weight = max(best_set[0], 1.0)
            db.add(
                PersonalRecord(
                    user_id=user.id,
                    exercise_catalog_id=main_lift.id,
                    weight=record_weight,
                    reps=best_set[1],
                    date=session_day,
                )
            )

    return created_sessions


def run_finance_demo_seed(
    *,
    reset: bool = False,
    july_through_day: int = 12,
    from_petr: bool = True,
    with_workouts: bool = True,
) -> FinanceDemoSeedResult:
    with SessionLocal() as db:
        user, created_user = _ensure_user(db)
        finance_count = int(
            db.scalar(
                select(func.count()).select_from(Entry).where(
                    Entry.user_id == user.id,
                    Entry.type == EntryType.finance.value,
                ),
            )
            or 0,
        )

        if finance_count > 0 and not reset:
            db.commit()
            return FinanceDemoSeedResult(
                email=FINANCE_DEMO_EMAIL,
                password=FINANCE_DEMO_PASSWORD,
                full_name=FINANCE_DEMO_FULL_NAME,
                created_user=created_user,
                finance_entries=finance_count,
                workout_sessions=0,
                category_count=0,
                skipped=True,
            )

        if reset:
            _clear_finance_entries(db, user.id)
            if with_workouts:
                _clear_workout_data(db, user.id)

        category_count = 0
        if from_petr:
            source = _get_user_by_email(db, PETR_SOURCE_EMAIL)
            if source is None:
                raise RuntimeError(f"Source user not found: {PETR_SOURCE_EMAIL}")
            finance_entries, category_count = copy_finance_from_user(db, source=source, target=user)
        else:
            finance_entries = seed_finance_demo_entries(db, user, july_through_day=july_through_day)
            category_count = len(
                {
                    category
                    for category in (
                        (entry.metadata_ or {}).get("category")
                        for entry in db.scalars(
                            select(Entry).where(Entry.user_id == user.id, Entry.type == EntryType.finance.value),
                        ).all()
                    )
                    if isinstance(category, str) and category.strip()
                },
            )

        workout_sessions = seed_workout_demo(db, user) if with_workouts else 0

        db.commit()

        return FinanceDemoSeedResult(
            email=FINANCE_DEMO_EMAIL,
            password=FINANCE_DEMO_PASSWORD,
            full_name=FINANCE_DEMO_FULL_NAME,
            created_user=created_user,
            finance_entries=finance_entries,
            workout_sessions=workout_sessions,
            category_count=category_count,
            skipped=False,
        )
