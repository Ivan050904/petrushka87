from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.schemas.entry import EntryType
from app.services.context.context_models import PINNED_SCORE, ContextScope, ContextSnippet
from app.services.context.query_intent import QueryIntent
from app.services.context.retrievers.base import entry_to_snippet, retrieve_hybrid

SCOPE: ContextScope = "plans"


def _metadata_text(field: str):
    return func.json_extract(Entry.metadata_, f"$.{field}")


def _pinned_by_date_range(
    db: Session,
    user_id: uuid.UUID,
    date_range: tuple[str, str],
) -> list[ContextSnippet]:
    start, end = date_range
    entries = db.scalars(
        select(Entry)
        .where(
            Entry.user_id == user_id,
            Entry.type.in_([EntryType.task.value, EntryType.event.value, EntryType.reminder.value]),
        )
        .order_by(Entry.updated_at.desc())
        .limit(500)
    ).all()

    pinned: list[ContextSnippet] = []
    for entry in entries:
        metadata = entry.metadata_ or {}
        for key in ("deadline", "scheduled_at", "starts_at", "remind_at"):
            raw = metadata.get(key)
            if not isinstance(raw, str) or len(raw) < 10:
                continue
            day = raw[:10]
            if start <= day <= end:
                snippet = entry_to_snippet(entry, scope=SCOPE, score=PINNED_SCORE)
                if snippet is not None:
                    pinned.append(snippet)
                break
    return pinned


def retrieve(
    db: Session,
    user_id: uuid.UUID,
    query: str,
    *,
    intent: QueryIntent,
    limit: int,
    primary_entry_id: uuid.UUID | None = None,
) -> list[ContextSnippet]:
    pinned: list[ContextSnippet] = []
    if intent.date_range:
        pinned = _pinned_by_date_range(db, user_id, intent.date_range)

    return retrieve_hybrid(
        db,
        user_id,
        query,
        scope=SCOPE,
        limit=limit,
        pinned=pinned,
        primary_entry_id=primary_entry_id,
    )
