from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import settings
from app.services.context.date_query import parse_dates_from_query
from app.services.context.entry_rag_text import MONTH_NAMES_GENITIVE

MONTH_NAMES_NOMINATIVE = (
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
)
_ALL_MONTHS = MONTH_NAMES_GENITIVE + MONTH_NAMES_NOMINATIVE
_MONTH_PATTERN = "|".join(_ALL_MONTHS)
_MONTH_ONLY_RE = re.compile(rf"\b(?:за|в|за\s+месяц)?\s*({_MONTH_PATTERN})(?:\s+(\d{{4}}))?\b", re.IGNORECASE)
_WEEK_RE = re.compile(
    r"\b(?:на|за)?\s*(?:эт(?:ой|ую)|текущ(?:ей|ую)|прошл(?:ой|ую)|последн(?:ей|юю))\s+недел",
    re.IGNORECASE,
)
_MONTH_PHRASE_RE = re.compile(
    rf"\b(?:за|в)\s+({_MONTH_PATTERN})(?:\s+(\d{{4}}))?\b",
    re.IGNORECASE,
)


def _user_today() -> date:
    try:
        tz = ZoneInfo(settings.user_timezone)
    except ZoneInfoNotFoundError:
        tz = timezone.utc
    return datetime.now(tz).date()


def _month_number(name: str) -> int | None:
    lowered = name.lower().replace("ё", "е")
    for index, month in enumerate(MONTH_NAMES_GENITIVE, start=1):
        if month == lowered:
            return index
    for index, month in enumerate(MONTH_NAMES_NOMINATIVE, start=1):
        if month == lowered:
            return index
    return None


def parse_finance_month(query: str) -> str | None:
    normalized = query.lower().replace("ё", "е")
    if not any(token in normalized for token in ("расход", "доход", "финанс", "трат", "бюджет", "оплат")):
        return None
    match = _MONTH_PHRASE_RE.search(normalized) or _MONTH_ONLY_RE.search(normalized)
    if not match:
        return None
    month = _month_number(match.group(1))
    if month is None:
        return None
    year = int(match.group(2)) if match.group(2) else _user_today().year
    return f"{year:04d}-{month:02d}"


def parse_date_range(query: str) -> tuple[str, str] | None:
    normalized = query.lower().replace("ё", "е")
    today = _user_today()

    if _WEEK_RE.search(normalized):
        if "прошл" in normalized:
            end = today - timedelta(days=today.weekday() + 1)
            start = end - timedelta(days=6)
        else:
            start = today - timedelta(days=today.weekday())
            end = start + timedelta(days=6)
        return start.isoformat(), end.isoformat()

    if "прошл" in normalized and "месяц" in normalized:
        first_this_month = today.replace(day=1)
        last_prev = first_this_month - timedelta(days=1)
        start = last_prev.replace(day=1)
        return start.isoformat(), last_prev.isoformat()

    if "эт" in normalized and "месяц" in normalized:
        last_day = calendar.monthrange(today.year, today.month)[1]
        end = today.replace(day=last_day)
        return today.replace(day=1).isoformat(), end.isoformat()

    month_match = _MONTH_PHRASE_RE.search(normalized)
    if month_match:
        month = _month_number(month_match.group(1))
        if month is not None:
            year = int(month_match.group(2)) if month_match.group(2) else today.year
            last_day = calendar.monthrange(year, month)[1]
            start = date(year, month, 1)
            end = date(year, month, last_day)
            return start.isoformat(), end.isoformat()

    exact_dates = parse_dates_from_query(query)
    if len(exact_dates) == 1:
        iso = exact_dates[0]
        return iso, iso

    return None
