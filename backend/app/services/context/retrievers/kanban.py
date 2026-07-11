from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.services.context.context_models import ContextScope, KANBAN_BOARD_CONFIG_COLLECTION, ContextSnippet
from app.services.context.query_intent import QueryIntent
from app.services.context.retrievers.base import retrieve_hybrid

SCOPE: ContextScope = "kanban"


def _kanban_filter(statement):
    return statement.where(
        or_(
            func.json_extract(Entry.metadata_, "$.board_id").isnot(None),
            func.json_extract(Entry.metadata_, "$.collection") == KANBAN_BOARD_CONFIG_COLLECTION,
        )
    )


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
        extra_filter=_kanban_filter,
    )
