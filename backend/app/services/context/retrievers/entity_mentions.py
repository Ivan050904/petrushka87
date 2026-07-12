from __future__ import annotationsimport uuidfrom sqlalchemy.orm import Sessionfrom app.core.config import settingsfrom app.models.entry import Entryfrom app.schemas.entry import EntryTypefrom app.services.context.context_models import ContextSnippetfrom app.services.context.entity_excerpt import build_entity_excerpt, entry_matches_termsfrom app.services.context.entity_search import search_entity_mentionsfrom app.services.context.entry_rag_text import build_entry_rag_textfrom app.services.context.query_intent import QueryIntentdef _entry_sort_key(entry: Entry) -> tuple[str, str]:
    metadata = entry.metadata_ or {}
    entry_date = metadata.get("entry_date")
    if isinstance(entry_date, str) and entry_date.strip():
        return entry_date.strip(), entry.created_at.isoformat()
    return entry.created_at.date().isoformat(), entry.created_at.isoformat()


def retrieve(
    db: Session,
    user_id: uuid.UUID,
    query: str,
    *,
    intent: QueryIntent,
    limit: int,
    primary_entry_id: uuid.UUID | None = None,
) -> list[ContextSnippet]:
    del query, limit
    terms = intent.entity_terms
    if not terms:
        return []

    date_from, date_to = None, None
    if intent.date_range:
        date_from, date_to = intent.date_range

    entry_types: set[str] | None = None
    if intent.scopes == ["notes"]:
        entry_types = {EntryType.note.value, EntryType.diary.value}

    hits = search_entity_mentions(
        db,
        user_id,
        terms,
        date_from=date_from,
        date_to=date_to,
        limit=settings.context_entity_match_limit,
        entry_types=entry_types,
    )
    if not hits:
        return []

    excerpt_limit = settings.context_entity_excerpt_chars
    snippets: list[ContextSnippet] = []
    for index, hit in enumerate(hits):
        entry = db.get(Entry, hit.entry_id)
        if entry is None or entry.user_id != user_id:
            continue
        if not entry_matches_terms(entry, terms):
            continue
        full_text = build_entry_rag_text(entry)
        if not full_text.strip():
            continue
        text = build_entity_excerpt(full_text, terms, max_chars=excerpt_limit)
        metadata = entry.metadata_ or {}
        entry_date = metadata.get("entry_date")
        if not isinstance(entry_date, str) or not entry_date.strip():
            entry_date = hit.entry_date
        score = float(len(hits) - index)
        if entry.id == primary_entry_id:
            score += 10.0
        snippets.append(
            ContextSnippet(
                entry_id=entry.id,
                source=f"entry:{entry.type}",
                title=entry.title,
                text=text,
                score=score,
                entry_date=entry_date if isinstance(entry_date, str) else None,
                scope="all",
            )
        )

    snippets.sort(
        key=lambda item: _entry_sort_key(db.get(Entry, item.entry_id)) if item.entry_id else ("", "")
    )
    return snippets
