from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.schemas.entry import EntryType
from app.services.context.context_models import PINNED_SCORE, ContextScope, ContextSnippet
from app.services.context.query_intent import QueryIntent
from app.services.context.retrievers.base import entry_to_snippet, retrieve_hybrid

SCOPE: ContextScope = "finance"


def _metadata_text(field: str):
    return func.json_extract(Entry.metadata_, f"$.{field}")


def _pinned_by_month(db: Session, user_id: uuid.UUID, finance_month: str) -> list[ContextSnippet]:
    prefix = finance_month
    entries = db.scalars(
        select(Entry)
        .where(
            Entry.user_id == user_id,
            Entry.type == EntryType.finance.value,
            _metadata_text("transaction_date").like(f"{prefix}%"),
        )
        .order_by(Entry.updated_at.desc())
        .limit(200)
    ).all()
    pinned: list[ContextSnippet] = []
    for entry in entries:
        snippet = entry_to_snippet(entry, scope=SCOPE, score=PINNED_SCORE)
        if snippet is not None:
            pinned.append(snippet)
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
    if intent.finance_month:
        pinned = _pinned_by_month(db, user_id, intent.finance_month)

    return retrieve_hybrid(
        db,
        user_id,
        query,
        scope=SCOPE,
        limit=limit,
        pinned=pinned,
        primary_entry_id=primary_entry_id,
    )
