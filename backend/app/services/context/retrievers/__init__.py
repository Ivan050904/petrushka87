from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.services.context.context_models import ContextScope, ContextSnippet
from app.services.context.query_intent import QueryIntent

from . import finance, kanban, notes, people, plans, therapy, transcription, workouts

ALL_SCOPES: tuple[ContextScope, ...] = (
    "notes",
    "plans",
    "finance",
    "people",
    "transcription",
    "therapy",
    "kanban",
    "workouts",
)

RETRIEVER_MAP = {
    "notes": notes.retrieve,
    "plans": plans.retrieve,
    "finance": finance.retrieve,
    "people": people.retrieve,
    "transcription": transcription.retrieve,
    "therapy": therapy.retrieve,
    "kanban": kanban.retrieve,
    "workouts": workouts.retrieve,
    "all": notes.retrieve,
}


def retrieve_for_scope(
    db: Session,
    user_id: uuid.UUID,
    query: str,
    *,
    scope: ContextScope,
    intent: QueryIntent,
    limit: int,
    primary_entry_id: uuid.UUID | None = None,
) -> list[ContextSnippet]:
    if scope == "all":
        merged: list[ContextSnippet] = []
        per_scope = max(5, limit // len(ALL_SCOPES))
        for module_scope in ALL_SCOPES:
            merged.extend(
                retrieve_for_scope(
                    db,
                    user_id,
                    query,
                    scope=module_scope,  # type: ignore[arg-type]
                    intent=intent,
                    limit=per_scope,
                    primary_entry_id=primary_entry_id,
                )
            )
        return merged

    handler = RETRIEVER_MAP.get(scope)
    if handler is None:
        return []
    return handler(
        db,
        user_id,
        query,
        intent=intent,
        limit=limit,
        primary_entry_id=primary_entry_id,
    )
