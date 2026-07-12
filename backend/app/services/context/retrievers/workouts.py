from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.services.context.context_models import ContextScope, ContextSnippet
from app.services.context.query_intent import QueryIntent
from app.services.context.retrievers.base import retrieve_hybrid

SCOPE: ContextScope = "workouts"


def retrieve(
    db: Session,
    user_id: uuid.UUID,
    query: str,
    *,
    intent: QueryIntent,
    limit: int,
    primary_entry_id: uuid.UUID | None = None,
) -> list[ContextSnippet]:
    del intent
    return retrieve_hybrid(
        db,
        user_id,
        query,
        scope=SCOPE,
        limit=limit,
        pinned=[],
        primary_entry_id=primary_entry_id,
    )
