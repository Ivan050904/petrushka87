from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.context.context_models import PINNED_SCORE, ContextScope, ContextSnippet
from app.services.context.date_query import lookup_entries_by_dates
from app.services.context.query_intent import QueryIntent
from app.services.context.retrievers.base import retrieve_hybrid

SCOPE: ContextScope = "notes"


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
    if intent.matched_dates and settings.context_date_lookup_enabled:
        pinned = lookup_entries_by_dates(db, user_id, intent.matched_dates, SCOPE)
        pinned = [item.model_copy(update={"scope": SCOPE, "score": PINNED_SCORE}) for item in pinned]

    return retrieve_hybrid(
        db,
        user_id,
        query,
        scope=SCOPE,
        limit=limit,
        pinned=pinned,
        primary_entry_id=primary_entry_id,
    )
