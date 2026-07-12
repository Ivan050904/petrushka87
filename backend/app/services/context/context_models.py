from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.models.entry import Entry
from app.schemas.entry import EntryType

ContextScope = Literal["all", "notes", "plans", "finance", "people", "transcription", "therapy", "kanban", "workouts"]
RetrievalMode = Literal["ranked", "entity_timeline"]

PINNED_SCORE = 10_000.0

SCOPE_TYPES: dict[ContextScope, set[str]] = {
    "all": set(),
    "notes": {EntryType.note.value, EntryType.diary.value},
    "plans": {EntryType.task.value, EntryType.event.value, EntryType.reminder.value},
    "finance": {EntryType.finance.value, EntryType.habit.value, EntryType.food.value},
    "people": {EntryType.person.value},
    "transcription": {EntryType.transcription.value, EntryType.resource.value},
    "therapy": {EntryType.therapy_session.value},
    "kanban": {EntryType.task.value, EntryType.note.value},
    "workouts": {EntryType.workout.value},
}

KANBAN_BOARD_CONFIG_COLLECTION = "kanban_board_config"

KANBAN_BOARD_LABELS: dict[str, str] = {
    "kanban_code": "Отдел разработки",
    "kanban_tasks": "Задачи",
    "kanban_psych": "Психология",
}


class ContextSnippet(BaseModel):
    entry_id: uuid.UUID | None = None
    job_id: int | None = None
    source: str
    title: str
    text: str
    score: float = 0.0
    entry_date: str | None = None
    scope: ContextScope | None = None


class UserContext(BaseModel):
    scope: ContextScope
    query: str
    snippets: list[ContextSnippet] = Field(default_factory=list)
    primary_entry_id: uuid.UUID | None = None
    matched_dates: list[str] = Field(default_factory=list)
    effective_scope: ContextScope | None = None
    searched_scopes: list[ContextScope] = Field(default_factory=list)
    router_confidence: float = 0.0
    embedding_provider: str = "hash"
    retrieval_mode: RetrievalMode = "ranked"
    entity_terms: list[str] = Field(default_factory=list)
    catalog_summary: str | None = None
    entity_match_total: int | None = None
    entity_year_counts: dict[str, int] = Field(default_factory=dict)


def read_kanban_board_id(metadata: dict) -> str | None:
    for key in ("board_id", "board"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def entry_has_kanban_metadata(entry: Entry) -> bool:
    metadata = entry.metadata_ or {}
    if metadata.get("collection") == KANBAN_BOARD_CONFIG_COLLECTION:
        return True
    return read_kanban_board_id(metadata) is not None


def scope_for_entry(entry: Entry) -> ContextScope:
    if entry_has_kanban_metadata(entry):
        return "kanban"
    for scope, types in SCOPE_TYPES.items():
        if scope == "all" or scope == "kanban":
            continue
        if entry.type in types:
            return scope
    return "all"


def matches_scope(entry: Entry, scope: ContextScope) -> bool:
    if scope == "all":
        return True
    if scope == "kanban":
        return entry_has_kanban_metadata(entry)
    allowed = SCOPE_TYPES[scope]
    if entry.type in allowed:
        if scope == "kanban":
            return entry_has_kanban_metadata(entry)
        return True
    if scope == "notes" and entry.metadata_.get("collection") == "life_notes":
        return True
    return False


def infer_scopes_from_query(query: str) -> list[ContextScope]:
    normalized = query.lower().replace("ё", "е")
    scopes: list[ContextScope] = []
    if any(token in normalized for token in ("дневник", "заметк", "life note", "life_notes")):
        scopes.append("notes")
    if any(token in normalized for token in ("задач", "встреч", "событи", "календар", "план")):
        scopes.append("plans")
    if any(token in normalized for token in ("финанс", "расход", "доход", "трат", "бюджет")):
        scopes.append("finance")
    if any(token in normalized for token in ("человек", "контакт", "люди")):
        scopes.append("people")
    if any(token in normalized for token in ("транскрип", "видео", "youtube")):
        scopes.append("transcription")
    if any(
        token in normalized
        for token in ("психолог", "терап", "сесс", "защитн", "интервен", "therapy")
    ):
        scopes.append("therapy")
    if any(token in normalized for token in ("канбан", "доск", "board", "колонк")):
        scopes.append("kanban")
    if any(token in normalized for token in ("трениров", "зал", "жим", "подход", "workout", "упражнен")):
        scopes.append("workouts")
    if any(token in normalized for token in ("недел", "сводк", "итог", "обзор")):
        for item in ("notes", "plans", "finance"):
            if item not in scopes:
                scopes.append(item)  # type: ignore[arg-type]
    return scopes


def infer_scope_from_query(query: str) -> ContextScope | None:
    scopes = infer_scopes_from_query(query)
    if not scopes:
        return None
    if len(scopes) == 1:
        return scopes[0]
    return scopes[0]
