from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.models.entry import Entry

MONTH_NAMES_GENITIVE = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)

WEEKDAY_NAMES = (
    "понедельник",
    "вторник",
    "среда",
    "четверг",
    "пятница",
    "суббота",
    "воскресенье",
)


def _month_name_genitive(month: int) -> str:
    return MONTH_NAMES_GENITIVE[month - 1]


def format_russian_date(iso_date: str) -> str:
    parsed = date.fromisoformat(iso_date)
    weekday = WEEKDAY_NAMES[parsed.weekday()]
    return f"{parsed.day} {_month_name_genitive(parsed.month)} {parsed.year} {weekday}"


def _append_str(parts: list[str], value: Any) -> None:
    if isinstance(value, str) and value.strip():
        parts.append(value.strip())


def _append_metadata_fields(parts: list[str], metadata: dict[str, Any], keys: tuple[str, ...]) -> None:
    for key in keys:
        value = metadata.get(key)
        if value is None:
            continue
        if isinstance(value, (int, float)):
            parts.append(f"{key}: {value}")
        elif isinstance(value, str):
            _append_str(parts, value)


def build_entry_rag_text(entry: Entry) -> str:
    parts: list[str] = []
    metadata = entry.metadata_ or {}

    _append_str(parts, entry.title)
    _append_str(parts, entry.content)

    for key in ("description", "project", "category", "url", "collection", "mode", "kind"):
        _append_str(parts, metadata.get(key))

    for key in ("board_id", "kanban_column", "column_id", "column_label"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(f"kanban {key}: {value.strip()}")

    cards = metadata.get("cards")
    if isinstance(cards, list):
        for card in cards[:20]:
            if isinstance(card, dict):
                for card_key in ("title", "content", "column_id", "column_label"):
                    _append_str(parts, card.get(card_key))

    entry_date = metadata.get("entry_date")
    if isinstance(entry_date, str) and entry_date.strip():
        iso_date = entry_date.strip()
        parts.append(f"entry_date: {iso_date}")
        try:
            parts.append(format_russian_date(iso_date))
        except ValueError:
            pass

    entry_type = entry.type
    if entry_type == "task":
        _append_metadata_fields(
            parts,
            metadata,
            ("deadline", "scheduled_at", "ends_at", "project", "status"),
        )
    elif entry_type == "event":
        _append_metadata_fields(
            parts,
            metadata,
            ("starts_at", "ends_at", "location", "status"),
        )
    elif entry_type == "reminder":
        _append_metadata_fields(
            parts,
            metadata,
            ("remind_at", "target_title", "status"),
        )
    elif entry_type == "finance":
        _append_metadata_fields(
            parts,
            metadata,
            (
                "amount",
                "direction",
                "currency",
                "category",
                "counterparty",
                "transaction_date",
                "description",
                "bank",
            ),
        )
    elif entry_type == "person":
        _append_metadata_fields(
            parts,
            metadata,
            ("full_name", "notes", "birthday", "description"),
        )
        contacts = metadata.get("contacts")
        if isinstance(contacts, list):
            for contact in contacts:
                _append_str(parts, contact)
    elif entry_type == "therapy_session":
        _append_metadata_fields(
            parts,
            metadata,
            ("session_date", "duration_sec", "transcription_source", "analysis_model", "source_filename"),
        )
        session_date = metadata.get("session_date")
        if isinstance(session_date, str) and session_date.strip():
            try:
                parts.append(format_russian_date(session_date.strip()[:10]))
            except ValueError:
                pass

    transaction_date = metadata.get("transaction_date")
    if isinstance(transaction_date, str) and transaction_date.strip():
        raw = transaction_date.strip()
        parts.append(f"transaction_date: {raw}")
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            parts.append(format_russian_date(parsed.date().isoformat()))
        except ValueError:
            try:
                parts.append(format_russian_date(raw[:10]))
            except ValueError:
                pass

    return "\n".join(part for part in parts if part)
