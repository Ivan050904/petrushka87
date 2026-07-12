from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entry import Entry
from app.services.context.context_models import (
    PINNED_SCORE,
    ContextScope,
    ContextSnippet,
    UserContext,
)
from app.services.context.date_query import lookup_entries_by_dates
from app.services.context.entity_query import resolve_entity_terms
from app.services.context.entry_rag_text import build_entry_rag_text
from app.services.context.query_intent import QueryIntent, route_query
from app.services.context.retrievers import entity_mentions, retrieve_for_scope
from app.services.context.user_catalog import build_user_data_catalog
from app.services.embeddings.provider import get_embedding_provider_name
from app.services.entry_links import list_links_for_entry


def _dedupe_snippets(snippets: list[ContextSnippet]) -> list[ContextSnippet]:
    seen_entries: set[uuid.UUID] = set()
    seen_jobs: set[int] = set()
    deduped: list[ContextSnippet] = []
    for snippet in snippets:
        if snippet.entry_id is not None:
            if snippet.entry_id in seen_entries:
                continue
            seen_entries.add(snippet.entry_id)
        if snippet.job_id is not None:
            if snippet.job_id in seen_jobs:
                continue
            seen_jobs.add(snippet.job_id)
        deduped.append(snippet)
    return deduped


def _quota_per_scope(scopes: list[ContextScope], total: int) -> dict[ContextScope, int]:
    if not scopes:
        return {"all": total}
    minimum = 5
    base = max(minimum, total // max(len(scopes), 1))
    return {scope: base for scope in scopes}


def _boost_linked_entries(
    db: Session,
    user_id: uuid.UUID,
    snippets: list[ContextSnippet],
    *,
    primary_entry_id: uuid.UUID | None,
    limit: int = 3,
) -> list[ContextSnippet]:
    anchor_ids: list[uuid.UUID] = []
    if primary_entry_id is not None:
        anchor_ids.append(primary_entry_id)
    for snippet in snippets:
        if snippet.score >= 90.0 and snippet.entry_id is not None:
            anchor_ids.append(snippet.entry_id)
    if not anchor_ids:
        return snippets

    existing = {item.entry_id for item in snippets if item.entry_id is not None}
    linked: list[ContextSnippet] = []
    for entry_id in anchor_ids[:2]:
        for edge in list_links_for_entry(db, user_id=user_id, entry_id=entry_id):
            neighbor_id = edge.target_entry_id if edge.source_entry_id == entry_id else edge.source_entry_id
            if neighbor_id in existing:
                continue
            entry = db.get(Entry, neighbor_id)
            if entry is None or entry.user_id != user_id:
                continue
            text = build_entry_rag_text(entry)
            if not text.strip():
                continue
            metadata = entry.metadata_ or {}
            entry_date = metadata.get("entry_date")
            linked.append(
                ContextSnippet(
                    entry_id=entry.id,
                    source=f"entry:{entry.type}",
                    title=entry.title,
                    text=text[:4000],
                    score=25.0,
                    entry_date=entry_date if isinstance(entry_date, str) else None,
                )
            )
            existing.add(entry.id)
            if len(linked) >= limit:
                break
        if len(linked) >= limit:
            break

    if not linked:
        return snippets
    return _dedupe_snippets(snippets + linked)


def build_context(
    db: Session,
    user_id: uuid.UUID,
    query: str,
    *,
    scope: ContextScope = "all",
    limit: int | None = None,
    primary_entry_id: uuid.UUID | None = None,
) -> UserContext:
    normalized_query = query.strip()
    snippet_limit = limit if limit is not None else settings.context_snippet_limit
    intent: QueryIntent = route_query(normalized_query, conversation_scope=scope)

    catalog_summary = build_user_data_catalog(db, user_id) if settings.context_catalog_enabled else None

    if intent.retrieval_mode == "entity_timeline" and intent.entity_name:
        intent.entity_terms = resolve_entity_terms(db, user_id, intent.entity_name)
        collected = entity_mentions.retrieve(
            db,
            user_id,
            normalized_query,
            intent=intent,
            limit=settings.context_entity_match_limit,
            primary_entry_id=primary_entry_id,
        )
        entity_match_total = len(collected)
        year_counts: dict[str, int] = {}
        for snippet in collected:
            if snippet.entry_date and len(snippet.entry_date) >= 4:
                year = snippet.entry_date[:4]
                year_counts[year] = year_counts.get(year, 0) + 1
        return UserContext(
            scope=scope,
            query=normalized_query,
            snippets=collected[: settings.context_entity_match_limit],
            primary_entry_id=primary_entry_id,
            matched_dates=intent.matched_dates,
            effective_scope="all",
            searched_scopes=["all"],
            router_confidence=intent.confidence,
            embedding_provider=get_embedding_provider_name(),
            retrieval_mode="entity_timeline",
            entity_terms=intent.entity_terms,
            catalog_summary=catalog_summary,
            entity_match_total=entity_match_total,
            entity_year_counts=year_counts,
        )

    scopes = intent.scopes
    if scope != "all":
        # Conversation scope pins the module; query keywords only rank within it.
        scopes = [scope]

    quotas = _quota_per_scope(scopes, snippet_limit)
    collected: list[ContextSnippet] = []

    if intent.matched_dates and settings.context_date_lookup_enabled:
        pinned_notes = lookup_entries_by_dates(db, user_id, intent.matched_dates, "notes")
        collected.extend(item.model_copy(update={"scope": "notes", "score": PINNED_SCORE}) for item in pinned_notes)

    for module_scope in scopes:
        collected.extend(
            retrieve_for_scope(
                db,
                user_id,
                normalized_query,
                scope=module_scope,
                intent=intent,
                limit=quotas.get(module_scope, snippet_limit),
                primary_entry_id=primary_entry_id,
            )
        )

    collected = _dedupe_snippets(collected)
    collected.sort(key=lambda item: item.score, reverse=True)
    collected = _boost_linked_entries(
        db,
        user_id,
        collected,
        primary_entry_id=primary_entry_id,
    )
    collected.sort(key=lambda item: item.score, reverse=True)

    effective_scope = scopes[0] if len(scopes) == 1 else ("all" if "all" in scopes else scopes[0])

    return UserContext(
        scope=scope,
        query=normalized_query,
        snippets=collected[:snippet_limit],
        primary_entry_id=primary_entry_id,
        matched_dates=intent.matched_dates,
        effective_scope=effective_scope,
        searched_scopes=scopes,
        router_confidence=intent.confidence,
        embedding_provider=get_embedding_provider_name(),
        retrieval_mode=intent.retrieval_mode,
        entity_terms=intent.entity_terms,
        catalog_summary=catalog_summary,
    )
