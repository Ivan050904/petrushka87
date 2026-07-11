from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entry import Entry
from app.schemas.entry import EntryType
from app.services.context.context_models import ContextScope, ContextSnippet, PINNED_SCORE, matches_scope
from app.services.context.entry_rag_text import MONTH_NAMES_GENITIVE, build_entry_rag_text

_ISO_DATE_RE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_DOT_DATE_RE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b")
_RU_DATE_RE = re.compile(
    r"\b(\d{1,2})\s+(" + "|".join(MONTH_NAMES_GENITIVE) + r")(?:\s+(\d{4}))?\b",
    re.IGNORECASE,
)


def _default_year() -> int:
    try:
        tz = ZoneInfo(settings.user_timezone)
        return datetime.now(tz).date().year
    except ZoneInfoNotFoundError:
        return datetime.now(timezone.utc).date().year


def _month_number(name: str) -> int | None:
    lowered = name.lower()
    for index, month in enumerate(MONTH_NAMES_GENITIVE, start=1):
        if month == lowered:
            return index
    return None


def _normalize_iso(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def parse_dates_from_query(query: str) -> list[str]:
    normalized = query.strip().lower().replace("ё", "е")
    if not normalized:
        return []

    found: list[str] = []
    seen: set[str] = set()

    def add(iso: str | None) -> None:
        if iso and iso not in seen:
            seen.add(iso)
            found.append(iso)

    for match in _ISO_DATE_RE.finditer(normalized):
        add(_normalize_iso(int(match.group(1)), int(match.group(2)), int(match.group(3))))

    for match in _DOT_DATE_RE.finditer(normalized):
        add(_normalize_iso(int(match.group(3)), int(match.group(2)), int(match.group(1))))

    default_year = _default_year()
    for match in _RU_DATE_RE.finditer(normalized):
        day = int(match.group(1))
        month = _month_number(match.group(2))
        if month is None:
            continue
        year = int(match.group(3)) if match.group(3) else default_year
        add(_normalize_iso(year, month, day))

    return found


def _metadata_text(field: str):
    return func.json_extract(Entry.metadata_, f"$.{field}")


def lookup_entries_by_date(
    db: Session,
    user_id: uuid.UUID,
    iso_date: str,
    scope: ContextScope,
) -> list[ContextSnippet]:
    statement = (
        select(Entry)
        .where(
            Entry.user_id == user_id,
            _metadata_text("entry_date") == iso_date,
        )
        .order_by(Entry.updated_at.desc())
    )
    entries = db.scalars(statement).all()

    snippets: list[ContextSnippet] = []
    for entry in entries:
        if not matches_scope(entry, scope):
            if scope == "notes" and entry.type == EntryType.diary.value:
                pass
            elif scope != "all":
                continue
        text = build_entry_rag_text(entry)
        if not text.strip():
            continue
        snippets.append(
            ContextSnippet(
                entry_id=entry.id,
                source=f"entry:{entry.type}",
                title=entry.title,
                text=text[:4000],
                score=PINNED_SCORE,
                entry_date=iso_date,
            )
        )
    return snippets


def lookup_entries_by_dates(
    db: Session,
    user_id: uuid.UUID,
    iso_dates: list[str],
    scope: ContextScope,
) -> list[ContextSnippet]:
    pinned: list[ContextSnippet] = []
    seen_entry_ids: set[uuid.UUID] = set()
    for iso_date in iso_dates:
        for snippet in lookup_entries_by_date(db, user_id, iso_date, scope):
            if snippet.entry_id is None or snippet.entry_id in seen_entry_ids:
                continue
            seen_entry_ids.add(snippet.entry_id)
            pinned.append(snippet)
    return pinned
