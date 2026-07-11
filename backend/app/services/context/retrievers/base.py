from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entry import Entry
from app.services.context.context_models import ContextScope, ContextSnippet, matches_scope
from app.services.context.entry_rag_text import build_entry_rag_text
from app.services.embeddings.indexer import search_embeddings
from transcription.pipeline.retrieval import retrieve


def entry_to_snippet(entry: Entry, *, scope: ContextScope, score: float = 0.0) -> ContextSnippet | None:
    text = build_entry_rag_text(entry)
    if not text.strip():
        return None
    metadata = entry.metadata_ or {}
    entry_date = metadata.get("entry_date")
    return ContextSnippet(
        entry_id=entry.id,
        source=f"entry:{entry.type}",
        title=entry.title,
        text=text[:4000],
        score=score,
        entry_date=entry_date if isinstance(entry_date, str) else None,
        scope=scope,
    )


def collect_entry_candidates(
    db: Session,
    user_id: uuid.UUID,
    scope: ContextScope,
    *,
    candidate_limit: int,
    extra_filter=None,
) -> list[tuple[str, ContextSnippet]]:
    statement = (
        select(Entry)
        .where(Entry.user_id == user_id)
        .order_by(Entry.updated_at.desc())
        .limit(candidate_limit)
    )
    if extra_filter is not None:
        statement = extra_filter(statement)

    entries = db.scalars(statement).all()
    candidates: list[tuple[str, ContextSnippet]] = []
    for entry in entries:
        if not matches_scope(entry, scope):
            continue
        snippet = entry_to_snippet(entry, scope=scope)
        if snippet is None:
            continue
        candidates.append((build_entry_rag_text(entry), snippet))
    return candidates


def rank_candidates(
    db: Session,
    user_id: uuid.UUID,
    query: str,
    candidates: list[tuple[str, ContextSnippet]],
    *,
    scope: ContextScope,
    limit: int,
    primary_entry_id: uuid.UUID | None = None,
) -> list[ContextSnippet]:
    if not candidates:
        return []

    normalized_query = query.strip()
    if not normalized_query:
        return [snippet for _, snippet in candidates[:limit]]

    texts = [text for text, _ in candidates]
    ranked_chunks = retrieve(normalized_query, texts, k=min(limit * 2, len(texts)))
    rank_map = {chunk: index for index, chunk in enumerate(ranked_chunks)}

    vector_boost: dict[uuid.UUID, float] = {}
    for row in search_embeddings(
        db,
        user_id=user_id,
        query=normalized_query,
        limit=limit * 2,
        scopes=[scope] if scope != "all" else None,
    ):
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
    return ranked[:limit]


def retrieve_hybrid(
    db: Session,
    user_id: uuid.UUID,
    query: str,
    *,
    scope: ContextScope,
    limit: int,
    pinned: list[ContextSnippet],
    primary_entry_id: uuid.UUID | None = None,
    extra_filter=None,
) -> list[ContextSnippet]:
    candidate_limit = min(settings.context_candidate_limit, max(limit * 20, 200))
    pinned_ids = {item.entry_id for item in pinned if item.entry_id is not None}

    candidates = collect_entry_candidates(
        db,
        user_id,
        scope,
        candidate_limit=candidate_limit,
        extra_filter=extra_filter,
    )
    candidates = [
        (text, snippet)
        for text, snippet in candidates
        if snippet.entry_id is None or snippet.entry_id not in pinned_ids
    ]

    ranked = rank_candidates(
        db,
        user_id,
        query,
        candidates,
        scope=scope,
        limit=limit,
        primary_entry_id=primary_entry_id,
    )
    return pinned + ranked
