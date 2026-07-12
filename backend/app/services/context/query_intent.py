from __future__ import annotations

from dataclasses import dataclass, field

from app.core.config import settings
from app.services.context.context_models import ContextScope, RetrievalMode, infer_scopes_from_query
from app.services.context.date_query import parse_dates_from_query
from app.services.context.entity_query import extract_entity_name, is_entity_timeline_query
from app.services.context.query_parsers import parse_date_range, parse_finance_month


@dataclass
class QueryIntent:
    scopes: list[ContextScope] = field(default_factory=lambda: ["all"])
    confidence: float = 0.0
    matched_dates: list[str] = field(default_factory=list)
    date_range: tuple[str, str] | None = None
    finance_month: str | None = None
    keywords: list[str] = field(default_factory=list)
    retrieval_mode: RetrievalMode = "ranked"
    entity_name: str | None = None
    entity_terms: list[str] = field(default_factory=list)


def route_query(query: str, conversation_scope: ContextScope = "all") -> QueryIntent:
    normalized = query.strip()
    if not normalized:
        return QueryIntent(scopes=[conversation_scope if conversation_scope != "all" else "all"], confidence=0.0)

    matched_dates = parse_dates_from_query(normalized) if settings.context_date_lookup_enabled else []
    date_range = parse_date_range(normalized)
    finance_month = parse_finance_month(normalized)

    entity_name = extract_entity_name(normalized)
    retrieval_mode: RetrievalMode = "ranked"
    if entity_name and is_entity_timeline_query(normalized):
        retrieval_mode = "entity_timeline"

    keyword_scopes = infer_scopes_from_query(normalized)
    scopes: list[ContextScope] = []
    confidence = 0.0

    if retrieval_mode == "entity_timeline":
        scopes = ["all"]
        confidence = 0.92
        if any(token in normalized for token in ("в заметк", "в дневник", "life note", "life_notes")):
            scopes = ["notes"]
    elif keyword_scopes:
        scopes = keyword_scopes if settings.context_router_multi_scope else [keyword_scopes[0]]
        confidence = min(0.95, 0.55 + 0.1 * len(keyword_scopes))

    if matched_dates:
        if "notes" not in scopes:
            scopes.append("notes")
        confidence = max(confidence, 0.85)

    if date_range and not scopes:
        scopes = ["notes", "plans", "finance"] if settings.context_router_multi_scope else ["plans"]
        confidence = max(confidence, 0.75)

    if finance_month:
        if "finance" not in scopes:
            scopes.append("finance")
        confidence = max(confidence, 0.8)

    if conversation_scope != "all" and not scopes:
        scopes = [conversation_scope]
        confidence = max(confidence, 0.5)

    if not scopes or confidence < 0.4:
        scopes = ["all"]
        confidence = 0.35 if scopes == ["all"] else confidence

    if not settings.context_router_multi_scope and len(scopes) > 1:
        scopes = [scopes[0]]

    keywords = [token for token in normalized.lower().split() if len(token) > 2][:12]

    return QueryIntent(
        scopes=scopes,
        confidence=confidence,
        matched_dates=matched_dates,
        date_range=date_range,
        finance_month=finance_month,
        keywords=keywords,
        retrieval_mode=retrieval_mode,
        entity_name=entity_name,
    )
