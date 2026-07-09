from __future__ import annotations

import re
import uuid
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.transcription import TranscriptionJob
from app.schemas.entry import EntryType
from app.services.embeddings.indexer import search_embeddings
from transcription.pipeline.retrieval import retrieve

ContextScope = Literal["all", "notes", "plans", "finance", "people", "transcription"]

_SCOPE_TYPES: dict[ContextScope, set[str]] = {
    "all": set(),
    "notes": {EntryType.note.value, EntryType.diary.value},
    "plans": {EntryType.task.value, EntryType.event.value, EntryType.reminder.value},
    "finance": {EntryType.finance.value, EntryType.habit.value, EntryType.food.value},
    "people": {EntryType.person.value},
    "transcription": {EntryType.transcription.value, EntryType.resource.value},
}


class ContextSnippet(BaseModel):
    entry_id: uuid.UUID | None = None
    job_id: int | None = None
    source: str
    title: str
    text: str
    score: float = 0.0


class UserContext(BaseModel):
    scope: ContextScope
    query: str
    snippets: list[ContextSnippet] = Field(default_factory=list)
    primary_entry_id: uuid.UUID | None = None


def _entry_search_text(entry: Entry) -> str:
    parts = [entry.title, entry.content]
    metadata = entry.metadata_ or {}
    for key in ("description", "project", "category", "url"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value)
    return "\n".join(part for part in parts if part)


def _matches_scope(entry: Entry, scope: ContextScope) -> bool:
    if scope == "all":
        return True
    allowed = _SCOPE_TYPES[scope]
    if entry.type in allowed:
        return True
    if scope == "notes" and entry.metadata_.get("collection") == "life_notes":
        return True
    return False


def _collect_entry_candidates(
    db: Session,
    user_id: uuid.UUID,
    scope: ContextScope,
    *,
    primary_entry_id: uuid.UUID | None,
) -> list[tuple[str, ContextSnippet]]:
    statement = (
        select(Entry)
        .where(Entry.user_id == user_id)
        .order_by(Entry.updated_at.desc())
        .limit(500)
    )
    entries = db.scalars(statement).all()
    candidates: list[tuple[str, ContextSnippet]] = []

    for entry in entries:
        if not _matches_scope(entry, scope):
            continue
        text = _entry_search_text(entry)
        if not text.strip():
            continue
        snippet = ContextSnippet(
            entry_id=entry.id,
            source=f"entry:{entry.type}",
            title=entry.title,
            text=text[:4000],
            score=2.0 if primary_entry_id and entry.id == primary_entry_id else 0.0,
        )
        candidates.append((text, snippet))

    return candidates


def _collect_transcription_candidates(
    db: Session,
    user_id: uuid.UUID,
    scope: ContextScope,
) -> list[tuple[str, ContextSnippet]]:
    if scope not in {"all", "transcription"}:
        return []

    jobs = db.scalars(
        select(TranscriptionJob)
        .where(TranscriptionJob.user_id == user_id, TranscriptionJob.status == "done")
        .order_by(TranscriptionJob.updated_at.desc())
        .limit(100)
    ).all()

    candidates: list[tuple[str, ContextSnippet]] = []
    for job in jobs:
        text_parts = [job.title, job.summary, job.opinions]
        transcript_preview = (job.transcript or "")[:6000]
        if transcript_preview:
            text_parts.append(transcript_preview)
        text = "\n".join(part.strip() for part in text_parts if part and part.strip())
        if not text:
            continue
        candidates.append(
            (
                text,
                ContextSnippet(
                    entry_id=job.entry_id,
                    job_id=job.id,
                    source="transcription",
                    title=job.title or job.url,
                    text=text[:8000],
                ),
            )
        )
    return candidates


def build_user_context(
    db: Session,
    user_id: uuid.UUID,
    query: str,
    *,
    scope: ContextScope = "all",
    limit: int = 20,
    primary_entry_id: uuid.UUID | None = None,
) -> UserContext:
    normalized_query = query.strip()
    candidates = _collect_entry_candidates(
        db,
        user_id,
        scope,
        primary_entry_id=primary_entry_id,
    )
    candidates.extend(_collect_transcription_candidates(db, user_id, scope))

    if not candidates:
        return UserContext(scope=scope, query=normalized_query, primary_entry_id=primary_entry_id)

    if not normalized_query:
        snippets = [snippet for _, snippet in candidates[:limit]]
        return UserContext(
            scope=scope,
            query=normalized_query,
            snippets=snippets,
            primary_entry_id=primary_entry_id,
        )

    texts = [text for text, _ in candidates]
    ranked_chunks = retrieve(normalized_query, texts, k=min(limit, len(texts)))
    rank_map = {chunk: index for index, chunk in enumerate(ranked_chunks)}

    vector_boost: dict[uuid.UUID, float] = {}
    for row in search_embeddings(db, user_id=user_id, query=normalized_query, limit=limit):
        if row.entry_id is not None:
            vector_boost[row.entry_id] = max(vector_boost.get(row.entry_id, 0.0), 1.5)

    ranked: list[ContextSnippet] = []
    for text, snippet in candidates:
        if text not in rank_map:
            continue
        score = float(len(texts) - rank_map[text])
        if snippet.entry_id is not None:
            score += vector_boost.get(snippet.entry_id, 0.0)
        if snippet.entry_id == primary_entry_id:
            score += 10.0
        ranked.append(snippet.model_copy(update={"score": score}))

    ranked.sort(key=lambda item: item.score, reverse=True)
    if primary_entry_id is not None and not any(item.entry_id == primary_entry_id for item in ranked):
        for text, snippet in candidates:
            if snippet.entry_id == primary_entry_id:
                ranked.insert(0, snippet.model_copy(update={"score": 100.0}))
                break

    return UserContext(
        scope=scope,
        query=normalized_query,
        snippets=ranked[:limit],
        primary_entry_id=primary_entry_id,
    )


def format_context_for_prompt(context: UserContext, *, max_chars: int = 12000) -> str:
    if not context.snippets:
        return "Контекст пользователя пуст."

    lines = ["Контекст пользователя:"]
    used = 0
    for index, snippet in enumerate(context.snippets, start=1):
        block = f"[{index}] ({snippet.source}) {snippet.title}\n{snippet.text.strip()}"
        if used + len(block) > max_chars:
            break
        lines.append(block)
        used += len(block)
    return "\n\n".join(lines)
