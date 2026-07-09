from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from io import BytesIO
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entry import Entry
from app.models.user import User
from app.schemas.entry import EntryType
from app.schemas.metadata import normalize_metadata
from app.services.security import get_password_hash
from app.storage import get_file_storage

DEMO_EMAIL = "demo@letscore.local"
DEMO_PASSWORD = "demo12345"
DEMO_FULL_NAME = "Алексей Демо"
DEMO_SEED_MARKER = "letscore-demo-v1"
MIN_DEMO_ENTRIES = 40


@dataclass(frozen=True)
class DemoSeedResult:
    email: str
    password: str
    full_name: str
    created_user: bool
    entries_created: int
    entries_total: int
    skipped: bool


def _user_timezone() -> ZoneInfo | None:
    try:
        return ZoneInfo(settings.user_timezone)
    except ZoneInfoNotFoundError:
        return None


def _now_local() -> datetime:
    timezone = _user_timezone()
    if timezone is None:
        return datetime.now(UTC)
    return datetime.now(timezone)


def _today() -> date:
    return _now_local().date()


def _date_offset(days: int) -> str:
    return (_today() + timedelta(days=days)).isoformat()


def _datetime_offset(days: int, hour: int, minute: int = 0) -> str:
    target = datetime.combine(_today() + timedelta(days=days), time(hour, minute))
    return target.strftime("%Y-%m-%dT%H:%M")


def _utc_from_local(day_offset: int, hour: int, minute: int = 0) -> datetime:
    local_day = _today() + timedelta(days=day_offset)
    local_dt = datetime.combine(local_day, time(hour, minute))
    timezone = _user_timezone()
    if timezone is None:
        return local_dt.replace(tzinfo=UTC)
    return local_dt.replace(tzinfo=timezone).astimezone(UTC)


def _habit_logs(day_offsets: dict[int, str]) -> dict[str, str]:
    return {_date_offset(offset): status for offset, status in day_offsets.items()}


def _normalize(entry_type: EntryType, metadata: dict[str, Any]) -> dict[str, Any]:
    return normalize_metadata(entry_type, metadata)


def _add_entry(
    db: Session,
    *,
    user_id: Any,
    entry_type: EntryType,
    title: str,
    content: str,
    metadata: dict[str, Any] | None = None,
    created_at: datetime | None = None,
) -> Entry:
    normalized = _normalize(entry_type, metadata or {})
    normalized["demo_seed"] = DEMO_SEED_MARKER
    entry = Entry(
        user_id=user_id,
        type=entry_type.value,
        title=title,
        content=content,
        metadata_=normalized,
    )
    if created_at is not None:
        entry.created_at = created_at
        entry.updated_at = created_at
    db.add(entry)
    return entry


def _resource_samples() -> list[tuple[str, str, str]]:
    return [
        (
            "Чек-лист запуска MVP",
            "Короткий список проверок перед демонстрацией продукта.",
            "# Чек-лист запуска\n\n- [ ] Вход в демо-аккаунт\n- [ ] Дашборд загружается\n- [ ] Быстрый захват работает\n",
        ),
        (
            "Шаблон еженедельного обзора",
            "Структура для пятничного ретро и планирования.",
            "# Еженедельный обзор\n\n## Что сработало\n\n## Что мешало\n\n## Фокус на следующую неделю\n",
        ),
        (
            "Заметки по архитектуре",
            "Черновик раздела про универсальную сущность Entry.",
            "# Архитектура Entry\n\nОдна таблица, типизированные metadata и единый CRUD.\n",
        ),
        (
            "Список идей для трекинга",
            "Набросок метрик, которые стоит добавить после MVP.",
            "# Идеи трекинга\n\n- сон\n- настроение\n- фокус-сессии\n",
        ),
        (
            "Контакты поставщиков",
            "Справочник по подрядчикам и сервисам.",
            "# Поставщики\n\n- хостинг\n- домен\n- дизайн\n",
        ),
    ]


def _build_demo_entries(user_id: Any) -> list[dict[str, Any]]:
    today = _today()
    entries: list[dict[str, Any]] = []

    def push(
        entry_type: EntryType,
        title: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        *,
        day_offset: int = 0,
        hour: int = 9,
        minute: int = 0,
    ) -> None:
        entries.append(
            {
                "type": entry_type,
                "title": title,
                "content": content,
                "metadata": metadata or {},
                "created_at": _utc_from_local(day_offset, hour, minute),
            }
        )

    # Tasks — projects, statuses, deadlines
    task_specs = [
        ("Подготовить презентацию продукта", "Собрать слайды и сценарий демо на 12 минут", "active", "LetsCore", -1, 10, 30, _datetime_offset(3, 18, 0)),
        ("Согласовать макеты с дизайнером", "Пройтись по навигации и карточкам трекинга", "active", "LetsCore", -2, 11, 0, _datetime_offset(2, 15, 0)),
        ("Написать README для репозитория", "Добавить раздел про демо-аккаунт и быстрый старт", "done", "LetsCore", -5, 14, 0, None),
        ("Заказать продукты на неделю", "Овощи, крупы, курица, яйца", "active", "Дом", 0, 18, 0, _datetime_offset(0, 19, 30)),
        ("Оплатить интернет", "Проверить автоплатёж и чек", "inbox", "Дом", 0, 8, 15, _datetime_offset(2, 12, 0)),
        ("Записаться к стоматологу", "Профилактический осмотр", "inbox", "Здоровье", 0, 9, 0, None),
        ("Пробежка 5 км", "Лёгкий темп, без спринта", "active", "Здоровье", -1, 7, 0, _datetime_offset(0, 7, 30)),
        ("Сдать отчёт по расходам", "Свести траты за июнь", "done", "Финансы", -3, 16, 0, None),
        ("Обновить резюме", "Добавить блок про pet-проекты", "active", "Карьера", -1, 20, 0, _datetime_offset(8, 12, 0)),
        ("Подготовить вопросы к ментору", "Сфокусироваться на архитектуре и UX", "active", "Карьера", 1, 9, 0, _datetime_offset(6, 17, 0)),
        ("Разобрать входящие заметки", "Перевести 5 заметок в задачи", "inbox", "LetsCore", 0, 10, 0, None),
        ("Сверстать виджет питания", "Дуга КБЖУ и компактные бары", "done", "LetsCore", -4, 13, 0, None),
        ("Настроить CI для backend", "pytest + ruff в pull request", "cancelled", "LetsCore", -6, 12, 0, None),
        ("Купить подарок на день рождения", "Книга или набор для кофе", "active", "Личное", 2, 11, 0, _datetime_offset(10, 19, 0)),
        ("Спланировать отпуск", "3 варианта маршрута на август", "inbox", "Личное", 0, 21, 0, None),
    ]
    for title, content, status, project, day_offset, hour, minute, deadline in task_specs:
        metadata: dict[str, Any] = {"status": status, "project": project}
        if deadline:
            metadata["deadline"] = deadline
        push(EntryType.task, title, content, metadata, day_offset=day_offset, hour=hour, minute=minute)

    # Parent/child tasks are added later in seed_demo_entries

    # Reminders
    reminder_specs = [
        ("Позвонить маме", "Спросить про поездку", _datetime_offset(0, 20, 0), "scheduled"),
        ("Отправить макеты в чат", "Скинуть ссылку на Figma", _datetime_offset(0, 14, 0), "scheduled"),
        ("Забрать посылку", "Пункт выдачи до 21:00", _datetime_offset(0, 17, 30), "scheduled"),
        ("Оплатить подписку на музыку", "Проверить списание", _datetime_offset(1, 10, 0), "scheduled"),
        ("Напомнить про созвон", "Синк с командой в 11:00", _datetime_offset(1, 10, 45), "scheduled"),
        ("Купить билеты в кино", "Сеанс в субботу", _datetime_offset(2, 12, 0), "scheduled"),
        ("Сдать показания счётчиков", "До 25 числа", _datetime_offset(3, 9, 0), "scheduled"),
        ("Забронировать стол", "Ресторан у набережной", _datetime_offset(5, 18, 0), "scheduled"),
    ]
    for title, content, remind_at, status in reminder_specs:
        push(
            EntryType.reminder,
            title,
            content,
            {"remind_at": remind_at, "status": status},
            day_offset=-1,
            hour=8,
        )

    # Events
    event_specs = [
        ("Стендап команды", "Ежедневный синк 15 минут", -6, 10, 0, -6, 10, 15, "Zoom", "attending"),
        ("Воркшоп по UX", "Разбор паттернов захвата", -2, 16, 0, -2, 18, 0, "Онлайн", "attending"),
        ("Консультация с наставником", "Обсудить roadmap MVP", 0, 15, 0, 0, 16, 0, "Коворкинг", "tracking"),
        ("Встреча с инвестором", "Питч и демо продукта", 2, 14, 0, 2, 15, 30, "Офис", "tracking"),
        ("Йога в парке", "Групповое занятие", 1, 8, 0, 1, 9, 30, "Парк", "attending"),
        ("Python meetup", "Доклад про FastAPI", 4, 18, 30, 4, 21, 0, "IT-хаб", "tracking"),
        ("День рождения друга", "Ужин в ресторане", 6, 19, 0, 6, 23, 0, "Центр", "attending"),
        ("Стоматолог", "Плановый осмотр", 8, 11, 0, 8, 11, 45, "Клиника", "tracking"),
        ("Планёрка по продукту", "Приоритеты на неделю", 0, 11, 0, 0, 12, 0, "Zoom", "attending"),
        ("Кинотеатр", "Премьера в пятницу", 3, 19, 0, 3, 21, 30, "ТРЦ", "tracking"),
        ("Лекция по продуктивности", "Метод GTD в цифре", -1, 19, 0, -1, 20, 30, "Онлайн", "skipped"),
        ("Созвон с дизайнером", "Финализация навигации", 1, 13, 0, 1, 14, 0, "Telegram", "attending"),
    ]
    for title, content, start_day, sh, sm, end_day, eh, em, location, status in event_specs:
        push(
            EntryType.event,
            title,
            content,
            {
                "starts_at": _datetime_offset(start_day, sh, sm),
                "ends_at": _datetime_offset(end_day, eh, em),
                "location": location,
                "status": status,
                "linked_entry_ids": [],
            },
            day_offset=start_day,
            hour=sh,
            minute=sm,
        )

    # Finance
    finance_specs = [
        ("Зарплата", "Основной доход", 185000, "income", -30),
        ("Фриланс", "Мини-проект по верстке", 28000, "income", -12),
        ("Кофе", "Капучино утром", 320, "expense", 0),
        ("Обед", "Столовая рядом с офисом", 450, "expense", 0),
        ("Продукты", "Пятёрочка", 2840, "expense", -1),
        ("Такси", "До коворкинга", 390, "expense", -1),
        ("Подписка Spotify", "Семейный тариф", 269, "expense", -5),
        ("Книга", "Покупка на ЛитРес", 590, "expense", -7),
        ("Спортзал", "Абонемент на месяц", 3500, "expense", -10),
        ("Аптека", "Витамины", 1240, "expense", -14),
        ("Интернет", "Домашний тариф", 900, "expense", -20),
        ("Суши", "Заказ на выходных", 1680, "expense", -3),
        ("Бензин", "Заправка", 2200, "expense", -8),
        ("Подарок", "День рождения коллеги", 2500, "expense", -4),
        ("Коворкинг", "Дневной пропуск", 800, "expense", -2),
        ("Возврат", "Кэшбэк за покупки", 430, "income", -6),
        ("Обед", "Бизнес-ланч", 520, "expense", -2),
        ("Перекус", "Фрукты", 210, "expense", 0),
        ("Кино", "Билеты на премьеру", 980, "expense", -3),
        ("Доставка", "Курьер из маркетплейса", 199, "expense", -1),
    ]
    for title, content, amount, direction, day_offset in finance_specs:
        push(
            EntryType.finance,
            title,
            content,
            {
                "amount": amount,
                "direction": direction,
                "currency": "RUB",
                "description": content,
            },
            day_offset=day_offset,
            hour=12,
        )

    # Habits
    habit_specs = [
        (
            "Утренняя зарядка",
            "15 минут разминки",
            "tracking",
            {"kind": "daily"},
            {0: "done", -1: "done", -2: "skip", -3: "done", -4: "rest", -5: "done"},
        ),
        (
            "Чтение 30 минут",
            "Нон-фикшн или профессиональная литература",
            "automatic",
            {"kind": "daily"},
            {0: "done", -1: "done", -2: "done", -3: "done", -4: "done", -5: "skip"},
        ),
        (
            "Прогулка",
            "Минимум 6000 шагов",
            "tracking",
            {"kind": "weekdays", "weekdays": [1, 2, 3, 4, 5]},
            {-1: "done", -2: "done", -3: "rest", -4: "done", -5: "done"},
        ),
        (
            "Медитация",
            "10 минут дыхания",
            "desired",
            {"kind": "daily"},
            {-1: "skip", -3: "done", -5: "done"},
        ),
        (
            "Силовая тренировка",
            "3 раза в неделю",
            "tracking",
            {"kind": "weekly_target", "target": 3},
            {-1: "done", -3: "done", -6: "done", -8: "skip"},
        ),
        (
            "Планирование дня",
            "5 минут утром в журнале",
            "automatic",
            {"kind": "daily"},
            {0: "done", -1: "done", -2: "done", -3: "done", -4: "done"},
        ),
    ]
    for title, content, stage, regularity, log_offsets in habit_specs:
        push(
            EntryType.habit,
            title,
            content,
            {
                "stage": stage,
                "regularity": regularity,
                "logs": _habit_logs(log_offsets),
            },
            day_offset=-7,
            hour=7,
        )

    # Food — today and recent days
    food_specs = [
        ("Завтрак: овсянка", 0, 8, 420, 18, 12, 58, 280),
        ("Кофе с молоком", 0, 9, 85, 3, 4, 8, 200),
        ("Обед: курица с рисом", 0, 13, 610, 42, 14, 62, 380),
        ("Перекус: яблоко", 0, 16, 95, 0.5, 0.3, 24, 180),
        ("Ужин: салат с тунцом", 0, 19, 480, 35, 18, 28, 320),
        ("Завтрак: омлет", -1, 8, 390, 28, 26, 6, 240),
        ("Обед: суп и хлеб", -1, 13, 520, 16, 18, 64, 350),
        ("Ужин: гречка с индейкой", -1, 19, 540, 38, 12, 58, 400),
        ("Завтрак: творог", -2, 8, 310, 28, 8, 22, 200),
        ("Обед: паста", -2, 13, 680, 22, 16, 88, 420),
        ("Перекус: протеиновый батончик", -2, 17, 210, 20, 7, 18, 60),
        ("Ужин: рыба на пару", -2, 19, 420, 36, 10, 24, 300),
        ("Завтрак: смузи", -3, 8, 280, 12, 6, 42, 350),
        ("Обед: боул", -3, 13, 590, 30, 20, 55, 410),
        ("Ужин: овощи с тофу", -3, 19, 360, 22, 14, 28, 320),
    ]
    for title, day_offset, hour, calories, protein, fat, carbs, grams in food_specs:
        push(
            EntryType.food,
            title,
            title,
            {
                "entry_date": _date_offset(day_offset),
                "input_mode": "direct",
                "calories": calories,
                "protein": protein,
                "fat": fat,
                "carbs": carbs,
                "grams": grams,
            },
            day_offset=day_offset,
            hour=hour,
        )

    # People
    people_specs = [
        ("С. Л. Бедрина", "Научный руководитель", "1980-03-14", ["email: bedrina@university.edu", "telegram: @bedrina"]),
        ("Мария Иванова", "Product designer", "1992-07-22", ["telegram: @masha_design", "email: masha@studio.ru"]),
        ("Дмитрий Козлов", "Backend-разработчик", "1995-11-03", ["github: kozlov-dev", "telegram: @kozlov"]),
        ("Анна Смирнова", "Ментор по карьере", "1988-01-19", ["email: anna@mentor.ru"]),
        ("Игорь Петров", "Коллега по проекту", "1990-09-08", ["telegram: @igor_p"]),
        ("Елена Волкова", "HR в стартапе", "1987-05-30", ["email: elena@startup.io"]),
        ("Павел Орлов", "Друг с университета", "1994-12-12", ["telegram: @pavel_o", "phone: +7 900 000-00-01"]),
        ("Ольга Никитина", "Нутрициолог", "1991-04-17", ["telegram: @olya_nutri"]),
    ]
    for full_name, description, birthday, contacts in people_specs:
        push(
            EntryType.person,
            full_name,
            description,
            {
                "full_name": full_name,
                "description": description,
                "birthday": birthday,
                "contacts": contacts,
                "notes": description,
            },
            day_offset=-20,
            hour=10,
        )

    # Notes
    note_specs = [
        ("Идея: умный inbox", "Группировать входящие по срочности и типу", {"source": "dashboard"}, 0, 9),
        ("Ссылка на референс", "Посмотреть Linear и Things 3 для вдохновения", {}, -1, 15),
        ("Цитата", "Система нужна, чтобы освободить голову, а не заполнить её", {}, -2, 21),
        ("Пароль от гостевого Wi‑Fi", "office-guest / welcome2026", {}, -3, 11),
        ("Список покупок", "Молоко, яйца, авокадо, хлеб", {"source": "dashboard"}, 0, 8),
        ("Мысль про демо", "Показать связку захват → inbox → планы", {"source": "dashboard"}, 0, 10),
        ("Книга к прочтению", "Building a Second Brain", {}, -4, 19),
        ("Идея виджета", "Мини-лента последних расходов на дашборде", {}, -5, 14),
        ("Набросок landing", "Hero + 3 сценария + CTA на регистрацию", {}, -6, 16),
        ("Вопрос к ментору", "Как лучше версионировать metadata у Entry?", {"source": "dashboard"}, 0, 11),
    ]
    for title, content, metadata, day_offset, hour in note_specs:
        push(EntryType.note, title, content, metadata, day_offset=day_offset, hour=hour)

    # Diary
    for offset in range(-9, 0):
        day = today + timedelta(days=offset)
        moods = ["спокойный", "сфокусированный", "уставший", "вдохновлённый", "раздражённый"]
        mood = moods[abs(offset) % len(moods)]
        push(
            EntryType.diary,
            f"День {day.strftime('%d.%m')}",
            f"Короткая запись за {day.isoformat()}. Настроение: {mood}. "
            f"Главный фокус: {'продукт' if offset % 2 == 0 else 'здоровье'}.",
            {"entry_date": day.isoformat(), "mode": "diary"},
            day_offset=offset,
            hour=22,
        )

    return entries


def _ensure_demo_user(db: Session) -> tuple[User, bool]:
    email = DEMO_EMAIL.lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        user.full_name = DEMO_FULL_NAME
        user.hashed_password = get_password_hash(DEMO_PASSWORD)
        db.add(user)
        db.flush()
        return user, False

    user = User(
        email=email,
        full_name=DEMO_FULL_NAME,
        hashed_password=get_password_hash(DEMO_PASSWORD),
    )
    db.add(user)
    db.flush()
    return user, True


def _demo_entry_count(db: Session, user_id: Any) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(Entry)
            .where(Entry.user_id == user_id)
        )
        or 0
    )


def _clear_demo_entries(db: Session, user_id: Any) -> None:
    db.execute(delete(Entry).where(Entry.user_id == user_id))


def _seed_resources(db: Session, user_id: Any) -> int:
    storage = get_file_storage()
    created = 0
    for title, description, body in _resource_samples():
        payload = body.encode("utf-8")
        stored = storage.save(BytesIO(payload), filename=f"{title[:40].strip()}.md", content_type="text/markdown")
        metadata = _normalize(
            EntryType.resource,
            {
                "description": description,
                "file": {
                    "key": stored.key,
                    "filename": stored.filename,
                    "content_type": stored.content_type,
                    "size": stored.size,
                    "storage": storage.provider,
                },
            },
        )
        metadata["demo_seed"] = DEMO_SEED_MARKER
        db.add(
            Entry(
                user_id=user_id,
                type=EntryType.resource.value,
                title=title,
                content=description,
                metadata_=metadata,
                created_at=_utc_from_local(-15, 12, 0),
                updated_at=_utc_from_local(-15, 12, 0),
            )
        )
        created += 1
    return created


def seed_demo_entries(db: Session, user: User) -> int:
    specs = _build_demo_entries(user.id)
    created_entries: list[Entry] = []

    for spec in specs:
        entry = _add_entry(
            db,
            user_id=user.id,
            entry_type=spec["type"],
            title=spec["title"],
            content=spec["content"],
            metadata=spec["metadata"],
            created_at=spec["created_at"],
        )
        created_entries.append(entry)

    db.flush()

    task_entries = [entry for entry in created_entries if entry.type == EntryType.task.value]
    if len(task_entries) >= 3:
        parent = task_entries[0]
        child = _add_entry(
            db,
            user_id=user.id,
            entry_type=EntryType.task,
            title="Собрать скриншоты для слайдов",
            content="Дашборд, inbox, планы, трекинг, справочник",
            metadata={
                "status": "active",
                "project": "LetsCore",
                "parent_id": str(parent.id),
                "deadline": _datetime_offset(1, 16, 0),
            },
            created_at=_utc_from_local(-1, 11, 0),
        )
        _add_entry(
            db,
            user_id=user.id,
            entry_type=EntryType.task,
            title="Написать speaker notes",
            content="Короткие подсказки к каждому слайду",
            metadata={
                "status": "inbox",
                "project": "LetsCore",
                "parent_id": str(parent.id),
            },
            created_at=_utc_from_local(0, 9, 30),
        )
        _ = child

    created_count = len(specs) + 2
    created_count += _seed_resources(db, user.id)
    return created_count


def run_demo_seed(*, reset: bool = False) -> DemoSeedResult:
    with SessionLocal() as db:
        user, created_user = _ensure_demo_user(db)
        existing_count = _demo_entry_count(db, user.id)

        if existing_count >= MIN_DEMO_ENTRIES and not reset:
            db.commit()
            return DemoSeedResult(
                email=DEMO_EMAIL,
                password=DEMO_PASSWORD,
                full_name=DEMO_FULL_NAME,
                created_user=created_user,
                entries_created=0,
                entries_total=existing_count,
                skipped=True,
            )

        if reset and existing_count > 0:
            _clear_demo_entries(db, user.id)

        entries_created = seed_demo_entries(db, user)
        db.commit()
        total = _demo_entry_count(db, user.id)

        return DemoSeedResult(
            email=DEMO_EMAIL,
            password=DEMO_PASSWORD,
            full_name=DEMO_FULL_NAME,
            created_user=created_user,
            entries_created=entries_created,
            entries_total=total,
            skipped=False,
        )
