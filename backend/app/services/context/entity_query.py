from __future__ import annotations

import re
import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.schemas.entry import EntryType

_ENTITY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"(?:"
        r"что\s+(?:есть|знаешь|известно)\s+(?:про|о|об)\s+|"
        r"(?:все\s+)?(?:записи|упоминан\w*)\s+(?:про|о|об)\s+|"
        r"(?:найди|ищи|поиск(?:ай)?)(?:\s+\w+){0,6}\s+(?:упоминан\w*\s+)?(?:про|о|об)\s+|"
        r"про\s+"
        r")([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]*(?:\s+[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]*)?)",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:"
        r"что\s+(?:есть|знаешь|известно)\s+(?:про|о|об)\s+|"
        r"(?:все\s+)?(?:записи|упоминан\w*)\s+(?:про|о|об)\s+|"
        r"(?:найди|ищи|поиск(?:ай)?)(?:\s+\w+){0,6}\s+(?:упоминан\w*\s+)?(?:про|о|об)\s+|"
        r"про\s+"
        r")([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]*)",
        re.IGNORECASE,
    ),
    re.compile(r'"([^"]{2,80})"'),
    re.compile(r"«([^»]{2,80})»"),
)

_RUSSIAN_CASE_SUFFIXES = ("а", "у", "е", "ы", "и", "ой", "ей", "ью", "ом", "ем", "ю", "я")


def extract_entity_name(query: str) -> str | None:
    normalized = query.strip()
    if not normalized:
        return None
    for pattern in _ENTITY_PATTERNS:
        match = pattern.search(normalized)
        if match:
            candidate = match.group(1).strip(" .,!?;:")
            if len(candidate) >= 2:
                return candidate
    return None


def _simple_name_variants(name: str) -> list[str]:
    variants: list[str] = []
    base = name.strip()
    if not base:
        return variants

    def _add(value: str) -> None:
        cleaned = value.strip()
        if len(cleaned) >= 2 and cleaned.lower() not in {item.lower() for item in variants}:
            variants.append(cleaned)

    _add(base)
    lowered = base.lower()
    _add(lowered)
    if " " in base:
        _add(base.split()[0])
    if lowered.endswith("а") and len(lowered) >= 3:
        stem = base[:-1]
        for ending in ("у", "е", "ой", "ы", "и"):
            _add(stem + ending)
    if lowered.endswith("ю") and len(lowered) >= 3:
        stem = base[:-1]
        for ending in ("я", "е", "и", "ю"):
            _add(stem + ending)
    for suffix in _RUSSIAN_CASE_SUFFIXES:
        if lowered.endswith(suffix) and len(lowered) > len(suffix) + 1:
            _add(base[: -len(suffix)])
    return variants


def _person_aliases(entry: Entry) -> list[str]:
    aliases: list[str] = []
    metadata = entry.metadata_ or {}
    for key in ("full_name", "nickname", "aliases"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            aliases.append(value.strip())
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    aliases.append(item.strip())
    if entry.title.strip():
        aliases.append(entry.title.strip())
    if entry.content.strip():
        first_line = entry.content.strip().splitlines()[0]
        if first_line:
            aliases.append(first_line[:80])
    return aliases


def resolve_entity_terms(db: Session, user_id: uuid.UUID, entity_name: str) -> list[str]:
    terms = _simple_name_variants(entity_name)
    lowered = entity_name.strip().lower()
    if not lowered:
        return terms

    statement = select(Entry).where(
        Entry.user_id == user_id,
        Entry.type == EntryType.person.value,
        or_(
            Entry.title.ilike(f"%{entity_name.strip()}%"),
            Entry.content.ilike(f"%{entity_name.strip()}%"),
        ),
    )
    for person in db.scalars(statement).all():
        for alias in _person_aliases(person):
            for variant in _simple_name_variants(alias):
                if variant.lower() not in {item.lower() for item in terms}:
                    terms.append(variant)
    return terms


def is_entity_timeline_query(query: str) -> bool:
    normalized = query.lower().replace("ё", "е")
    markers = (
        "про ",
        "о ",
        "об ",
        "упоминан",
        "что есть",
        "что знаешь",
        "что известно",
        "все записи",
    )
    return any(marker in normalized for marker in markers) and extract_entity_name(query) is not None
