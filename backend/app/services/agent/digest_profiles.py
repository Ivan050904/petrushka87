from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Literal
from urllib.parse import urlparse

from app.core.config import settings
from app.services.agent.prompts import (
    DIGEST_FILTER_PROMPT,
    PSYCH_DIGEST_FILTER_PROMPT,
    format_digest_feedback_section,
    format_psych_digest_feedback_section,
)
from app.services.agent.psych_queries import (
    PsychQuerySelection,
    configured_psych_queries,
    select_rotated_psych_queries,
    uses_configured_psych_queries,
)
from app.services.agent.psych_relevance import filter_psych_candidates
from app.services.agent.tools.article_validator import filter_reachable_articles
from app.services.agent.tools.habr_search import habr_search
from app.services.agent.tools.web_search import SearchResult, web_search

DigestProfileName = Literal["ai", "psychology"]


@dataclass(frozen=True)
class DigestProfile:
    name: DigestProfileName
    enabled: bool
    default_topics: Callable[[], list[str]]
    max_articles: int
    metadata_source: str
    metadata_collection: str
    requires_ollama_health: bool
    use_llm_filter: bool
    allow_llm_fallback: bool
    filter_prompt_template: str
    format_feedback_section: Callable[..., str]

    def default_topic_list(self) -> list[str]:
        return self.default_topics()


def _ai_topics() -> list[str]:
    return list(settings.digest_topics)


def _psych_topics() -> list[str]:
    override = [item.strip() for item in settings.psych_digest_queries if item.strip()]
    if override:
        return override
    return [item.query for item in select_rotated_psych_queries()]


def _search_habr(
    queries: list[str],
    *,
    date_from: date,
    date_to: date,
    max_results_per_query: int = 20,
) -> list[SearchResult]:
    candidates: list[SearchResult] = []
    seen_urls: set[str] = set()
    for query in queries:
        for result in habr_search(
            query,
            date_from=date_from,
            date_to=date_to,
            max_results=max_results_per_query,
        ):
            if result.url in seen_urls:
                continue
            seen_urls.add(result.url)
            candidates.append(result)
    return candidates


def _search_duckduckgo_habr_fallback(queries: list[str]) -> list[SearchResult]:
    candidates: list[SearchResult] = []
    seen_urls: set[str] = set()
    for query in queries:
        for result in web_search(query, site="habr.com", timelimit="w"):
            if result.url in seen_urls:
                continue
            seen_urls.add(result.url)
            candidates.append(
                SearchResult(
                    title=result.title,
                    url=result.url,
                    snippet=result.snippet,
                    query=query,
                    published_at=result.published_at,
                    source_site=result.source_site or "habr.com",
                )
            )
    return candidates


def collect_ai_candidates(
    topics: list[str],
    *,
    date_from: date,
    date_to: date,
) -> list[SearchResult]:
    provider = settings.digest_search_provider.strip().lower()
    if provider == "habr":
        candidates = _search_habr(topics, date_from=date_from, date_to=date_to)
        if not candidates:
            candidates = _search_duckduckgo_habr_fallback(topics)
        return candidates

    candidates: list[SearchResult] = []
    seen_urls: set[str] = set()
    for query in topics:
        for result in web_search(query, site="habr.com", timelimit="w"):
            if result.url in seen_urls:
                continue
            seen_urls.add(result.url)
            candidates.append(
                SearchResult(
                    title=result.title,
                    url=result.url,
                    snippet=result.snippet,
                    query=query,
                    published_at=result.published_at,
                    source_site=result.source_site or "habr.com",
                )
            )
    return candidates


def _extract_source_site(url: str) -> str | None:
    parsed = urlparse(url)
    host = parsed.netloc.lower().removeprefix("www.")
    return host or None


def collect_psychology_candidates(
    topics: list[str] | None = None,
    *,
    user_id: uuid.UUID,
) -> tuple[list[SearchResult], dict[str, str]]:
    if topics:
        selections = [PsychQuerySelection(query=topic, tier="custom") for topic in topics]
    else:
        selections = configured_psych_queries(user_id)
    tier_by_query = {item.query: item.tier for item in selections}

    candidates_by_query: dict[str, list[SearchResult]] = {}
    seen_urls: set[str] = set()
    for selection in selections:
        tier_candidates: list[SearchResult] = []
        for result in web_search(selection.query, max_results=12, pause_seconds=1.5):
            if result.url in seen_urls:
                continue
            seen_urls.add(result.url)
            tier_candidates.append(
                SearchResult(
                    title=result.title,
                    url=result.url,
                    snippet=result.snippet,
                    query=selection.query,
                    published_at=result.published_at,
                    source_site=_extract_source_site(result.url),
                )
            )
        candidates_by_query[selection.query] = tier_candidates

    candidates: list[SearchResult] = []
    max_query_candidates = max((len(items) for items in candidates_by_query.values()), default=0)
    for index in range(max_query_candidates):
        for selection in selections:
            tier_candidates = candidates_by_query.get(selection.query, [])
            if index < len(tier_candidates):
                candidates.append(tier_candidates[index])

    relevant = filter_psych_candidates(
        candidates,
        allow_custom_sources=bool(topics and uses_configured_psych_queries(topics)),
    )
    return filter_reachable_articles(relevant), tier_by_query


def get_digest_profile(name: DigestProfileName) -> DigestProfile:
    if name == "psychology":
        return DigestProfile(
            name="psychology",
            enabled=settings.psych_digest_enabled,
            default_topics=_psych_topics,
            max_articles=settings.psych_digest_max_articles,
            metadata_source="psych_digest",
            metadata_collection="psychology",
            requires_ollama_health=False,
            use_llm_filter=settings.psych_digest_use_llm_filter,
            allow_llm_fallback=True,
            filter_prompt_template=PSYCH_DIGEST_FILTER_PROMPT,
            format_feedback_section=format_psych_digest_feedback_section,
        )
    return DigestProfile(
        name="ai",
        enabled=settings.digest_enabled,
        default_topics=_ai_topics,
        max_articles=settings.digest_max_articles,
        metadata_source="daily_digest",
        metadata_collection="ai",
        requires_ollama_health=True,
        use_llm_filter=True,
        allow_llm_fallback=True,
        filter_prompt_template=DIGEST_FILTER_PROMPT,
        format_feedback_section=format_digest_feedback_section,
    )
