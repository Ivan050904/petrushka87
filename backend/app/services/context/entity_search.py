from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import settings


@dataclass(frozen=True)
class EntitySearchHit:
    entry_id: uuid.UUID
    rank: float
    entry_date: str | None = None


_FTS_DDL = """
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    entry_id UNINDEXED,
    user_id UNINDEXED,
    title,
    content,
    entry_type UNINDEXED,
    entry_date UNINDEXED,
    tokenize='unicode61'
)
"""

_FTS_INSERT_TRIGGER = """
CREATE TRIGGER IF NOT EXISTS entries_fts_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(entry_id, user_id, title, content, entry_type, entry_date)
    VALUES (
        new.id,
        new.user_id,
        coalesce(new.title, ''),
        coalesce(new.content, ''),
        coalesce(new.type, ''),
        coalesce(json_extract(new.metadata, '$.entry_date'), '')
    );
END
"""

_FTS_DELETE_TRIGGER = """
CREATE TRIGGER IF NOT EXISTS entries_fts_ad AFTER DELETE ON entries BEGIN
    DELETE FROM entries_fts WHERE entry_id = old.id;
END
"""

_FTS_UPDATE_TRIGGER = """
CREATE TRIGGER IF NOT EXISTS entries_fts_au AFTER UPDATE ON entries BEGIN
    DELETE FROM entries_fts WHERE entry_id = old.id;
    INSERT INTO entries_fts(entry_id, user_id, title, content, entry_type, entry_date)
    VALUES (
        new.id,
        new.user_id,
        coalesce(new.title, ''),
        coalesce(new.content, ''),
        coalesce(new.type, ''),
        coalesce(json_extract(new.metadata, '$.entry_date'), '')
    );
END
"""


def ensure_entries_fts(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(text(_FTS_DDL))
        connection.execute(text(_FTS_INSERT_TRIGGER))
        connection.execute(text(_FTS_DELETE_TRIGGER))
        connection.execute(text(_FTS_UPDATE_TRIGGER))


def _fts_table_exists(db: Session) -> bool:
    row = db.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='entries_fts'")
    ).first()
    return row is not None


def populate_entries_fts(db: Session) -> int:
    engine = db.get_bind()
    ensure_entries_fts(engine)
    db.execute(text("DELETE FROM entries_fts"))
    result = db.execute(
        text(
            """
            INSERT INTO entries_fts(entry_id, user_id, title, content, entry_type, entry_date)
            SELECT
                id,
                user_id,
                coalesce(title, ''),
                coalesce(content, ''),
                coalesce(type, ''),
                coalesce(json_extract(metadata, '$.entry_date'), '')
            FROM entries
            """
        )
    )
    db.commit()
    return int(result.rowcount or 0)


def _escape_fts_term(term: str) -> str:
    cleaned = re.sub(r'["*]', " ", term).strip()
    return cleaned


def _build_fts_query(terms: list[str]) -> str | None:
    parts: list[str] = []
    seen: set[str] = set()
    for raw_term in terms:
        term = _escape_fts_term(raw_term)
        if len(term) < 2:
            continue
        quoted = f'"{term}"'
        if quoted not in seen:
            parts.append(quoted)
            seen.add(quoted)
        if len(term) >= 5:
            prefix = f"{term[:4]}*"
            if prefix not in seen:
                parts.append(prefix)
                seen.add(prefix)
    if not parts:
        return None
    return " OR ".join(parts)


def search_entity_mentions(
    db: Session,
    user_id: uuid.UUID,
    terms: list[str],
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int | None = None,
    entry_types: set[str] | None = None,
) -> list[EntitySearchHit]:
    if not terms:
        return []

    if not _fts_table_exists(db):
        ensure_entries_fts(db.get_bind())

    fts_query = _build_fts_query(terms)
    if fts_query is None:
        return []

    match_limit = limit if limit is not None else settings.context_entity_match_limit
    params: dict[str, object] = {
        "user_id": str(user_id),
        "fts_query": fts_query,
        "limit": match_limit,
    }

    filters = ["entries_fts.user_id = :user_id", "entries_fts MATCH :fts_query"]
    if date_from:
        filters.append("(entries_fts.entry_date = '' OR entries_fts.entry_date >= :date_from)")
        params["date_from"] = date_from
    if date_to:
        filters.append("(entries_fts.entry_date = '' OR entries_fts.entry_date <= :date_to)")
        params["date_to"] = date_to
    if entry_types:
        placeholders = ", ".join(f":type_{index}" for index, _ in enumerate(sorted(entry_types)))
        filters.append(f"entries_fts.entry_type IN ({placeholders})")
        for index, entry_type in enumerate(sorted(entry_types)):
            params[f"type_{index}"] = entry_type

    statement = text(
        f"""
        SELECT entry_id, bm25(entries_fts) AS rank, entry_date
        FROM entries_fts
        WHERE {' AND '.join(filters)}
        ORDER BY
            CASE WHEN entry_date = '' THEN 1 ELSE 0 END,
            entry_date ASC,
            rank
        LIMIT :limit
        """
    )
    rows = db.execute(statement, params).all()
    hits: list[EntitySearchHit] = []
    for row in rows:
        try:
            entry_id = uuid.UUID(str(row.entry_id))
        except ValueError:
            continue
        entry_date = str(row.entry_date).strip() if row.entry_date else None
        if entry_date == "":
            entry_date = None
        hits.append(
            EntitySearchHit(
                entry_id=entry_id,
                rank=float(row.rank),
                entry_date=entry_date,
            )
        )
    return hits
