from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entry import Entry
from app.models.user import User
from app.schemas.entry import EntryType
from app.schemas.metadata import normalize_metadata
from app.services.agent.llm import DigestLLMClient, check_ollama_health
from app.services.agent.prompts import DIGEST_FILTER_PROMPT
from app.services.agent.state import load_digest_state, save_digest_state
from app.services.agent.tools.habr_search import habr_search
from app.services.agent.tools.web_search import SearchResult, web_search
from app.services.ai.base import AIUnavailableError


@dataclass
class DigestResult:
    status: str
    articles_saved: int
    articles_skipped: int
    topics: list[str]
    message: str
    search_period_from: str | None = None
    search_period_to: str | None = None


@dataclass(frozen=True)
class SearchDateRange:
    date_from: date
    date_to: date


def _user_today() -> date:
    try:
        now = datetime.now(ZoneInfo(settings.user_timezone))
    except ZoneInfoNotFoundError:
        now = datetime.now(UTC)
    return now.date()


def _today_for_user() -> str:
    return _user_today().isoformat()


def compute_search_date_range(
    *,
    today: date,
    last_search_until: str | None,
    lookback_days: int,
) -> SearchDateRange | None:
    if last_search_until:
        try:
            previous_until = date.fromisoformat(last_search_until)
        except ValueError:
            previous_until = None
    else:
        previous_until = None

    date_to = today
    if previous_until is None:
        date_from = today - timedelta(days=max(lookback_days, 1))
    else:
        date_from = previous_until + timedelta(days=1)

    if date_from > date_to:
        return None

    return SearchDateRange(date_from=date_from, date_to=date_to)


def _build_search_queries(topics: list[str]) -> list[str]:
    queries: list[str] = []
    for topic in topics:
        cleaned = topic.strip()
        if cleaned:
            queries.append(cleaned)
    return queries


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


def _search_duckduckgo_fallback(queries: list[str]) -> list[SearchResult]:
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
                    query=result.query,
                    published_at=result.published_at,
                    source_site=result.source_site or "habr.com",
                )
            )
    return candidates


def _collect_candidates(
    topics: list[str],
    *,
    date_from: date,
    date_to: date,
) -> list[SearchResult]:
    queries = _build_search_queries(topics)
    provider = settings.digest_search_provider.strip().lower()

    if provider == "habr":
        candidates = _search_habr(queries, date_from=date_from, date_to=date_to)
        if not candidates:
            candidates = _search_duckduckgo_fallback(queries)
        return candidates

    candidates: list[SearchResult] = []
    seen_urls: set[str] = set()
    for query in queries:
        for result in web_search(query, site="habr.com", timelimit="w"):
            if result.url in seen_urls:
                continue
            seen_urls.add(result.url)
            candidates.append(result)
    return candidates


def _serialize_candidates(candidates: list[SearchResult]) -> list[dict[str, str | None]]:
    return [
        {
            "title": item.title,
            "url": item.url,
            "snippet": item.snippet,
            "query": item.query,
            "published_at": item.published_at,
            "source_site": item.source_site,
        }
        for item in candidates
    ]


def _filter_with_llm(
    candidates: list[SearchResult],
    *,
    max_articles: int,
) -> list[dict[str, Any]]:
    if not candidates:
        return []

    llm = DigestLLMClient()
    if not llm.is_configured():
        raise AIUnavailableError("Digest LLM is not configured")

    system_prompt = DIGEST_FILTER_PROMPT.format(max_articles=max_articles)
    user_prompt = (
        "Select the best articles from these candidates:\n"
        f"{_serialize_candidates(candidates)}"
    )
    payload = llm.complete_json(system_prompt=system_prompt, user_prompt=user_prompt)
    articles = payload.get("articles")
    if not isinstance(articles, list):
        return []
    return [item for item in articles if isinstance(item, dict)]


def _fallback_filter(
    candidates: list[SearchResult],
    *,
    max_articles: int,
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for item in candidates[:max_articles]:
        selected.append(
            {
                "title": item.title,
                "url": item.url,
                "summary_ru": item.snippet or item.title,
                "query": item.query,
                "published_at": item.published_at,
                "source_site": item.source_site,
            }
        )
    return selected


def _candidate_by_url(candidates: list[SearchResult]) -> dict[str, SearchResult]:
    return {item.url: item for item in candidates}


def _existing_article_urls(db: Session, user_id: uuid.UUID) -> set[str]:
    rows = db.scalars(
        select(Entry).where(
            Entry.user_id == user_id,
            Entry.type == EntryType.resource.value,
            func.json_extract(Entry.metadata_, "$.kind") == "article",
        )
    ).all()
    urls: set[str] = set()
    for row in rows:
        url = row.metadata_.get("url")
        if isinstance(url, str) and url.strip():
            urls.add(url.strip())
    return urls


def _resolve_user(db: Session, user_id: uuid.UUID | None, user_email: str | None) -> User:
    if user_id is not None:
        user = db.get(User, user_id)
        if user is None:
            raise ValueError("Digest user was not found")
        return user

    email = (user_email or settings.digest_user_email).strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None:
        raise ValueError(f"Digest user with email {email} was not found")
    return user


def _save_articles(
    db: Session,
    *,
    user_id: uuid.UUID,
    articles: list[dict[str, Any]],
    existing_urls: set[str],
    discovered_at: str,
    candidate_index: dict[str, SearchResult],
    search_period_from: str,
    search_period_to: str,
) -> tuple[int, int]:
    saved = 0
    skipped = 0

    for article in articles:
        title = str(article.get("title") or "").strip()
        url = str(article.get("url") or "").strip()
        summary = str(article.get("summary_ru") or article.get("snippet") or title).strip()
        query = str(article.get("query") or "").strip()
        if not title or not url:
            skipped += 1
            continue
        if url in existing_urls:
            skipped += 1
            continue

        candidate = candidate_index.get(url)
        published_at = str(article.get("published_at") or "").strip() or None
        source_site = str(article.get("source_site") or "").strip() or None
        if candidate is not None:
            published_at = published_at or candidate.published_at
            source_site = source_site or candidate.source_site

        metadata = normalize_metadata(
            EntryType.resource,
            {
                "kind": "article",
                "url": url,
                "source": "daily_digest",
                "discovered_at": discovered_at,
                "query": query or None,
                "summary_ru": summary or None,
                "description": summary or None,
                "published_at": published_at,
                "source_site": source_site,
                "search_period_from": search_period_from,
                "search_period_to": search_period_to,
            },
        )
        entry = Entry(
            user_id=user_id,
            type=EntryType.resource.value,
            title=title[:160],
            content=summary or title,
            metadata_=metadata,
        )
        db.add(entry)
        existing_urls.add(url)
        saved += 1

    if saved:
        db.commit()
    return saved, skipped


def run_daily_digest(
    db: Session,
    *,
    user_id: uuid.UUID | None = None,
    user_email: str | None = None,
    topics: list[str] | None = None,
    max_articles: int | None = None,
    skip_health_check: bool = False,
) -> DigestResult:
    if not settings.digest_enabled:
        result = DigestResult(
            status="disabled",
            articles_saved=0,
            articles_skipped=0,
            topics=topics or list(settings.digest_topics),
            message="Daily digest is disabled in configuration",
        )
        save_digest_state(status=result.status, error=result.message, topics=result.topics)
        return result

    selected_topics = topics or list(settings.digest_topics)
    article_limit = max_articles or settings.digest_max_articles
    digest_state = load_digest_state()
    today = _user_today()
    date_range = compute_search_date_range(
        today=today,
        last_search_until=digest_state.last_search_until,
        lookback_days=settings.digest_first_run_lookback_days,
    )

    if date_range is None:
        result = DigestResult(
            status="up_to_date",
            articles_saved=0,
            articles_skipped=0,
            topics=selected_topics,
            message="Digest is already up to date for today",
            search_period_from=None,
            search_period_to=today.isoformat(),
        )
        save_digest_state(status=result.status, topics=selected_topics)
        return result

    period_from = date_range.date_from.isoformat()
    period_to = date_range.date_to.isoformat()

    try:
        user = _resolve_user(db, user_id, user_email)
        if not skip_health_check and not check_ollama_health():
            raise AIUnavailableError("Ollama is not reachable. Start Ollama before running digest.")

        candidates = _collect_candidates(
            selected_topics,
            date_from=date_range.date_from,
            date_to=date_range.date_to,
        )
        if not candidates:
            result = DigestResult(
                status="empty",
                articles_saved=0,
                articles_skipped=0,
                topics=selected_topics,
                message="No search results were found for the selected date range",
                search_period_from=period_from,
                search_period_to=period_to,
            )
            save_digest_state(
                status=result.status,
                topics=selected_topics,
                last_search_until=period_to,
            )
            return result

        try:
            filtered = _filter_with_llm(candidates, max_articles=article_limit)
        except (AIUnavailableError, Exception):
            filtered = _fallback_filter(candidates, max_articles=article_limit)

        discovered_at = _today_for_user()
        existing_urls = _existing_article_urls(db, user.id)
        candidate_index = _candidate_by_url(candidates)
        saved, skipped = _save_articles(
            db,
            user_id=user.id,
            articles=filtered,
            existing_urls=existing_urls,
            discovered_at=discovered_at,
            candidate_index=candidate_index,
            search_period_from=period_from,
            search_period_to=period_to,
        )

        result = DigestResult(
            status="ok",
            articles_saved=saved,
            articles_skipped=skipped,
            topics=selected_topics,
            message=f"Saved {saved} articles, skipped {skipped}",
            search_period_from=period_from,
            search_period_to=period_to,
        )
        save_digest_state(
            status=result.status,
            articles_saved=result.articles_saved,
            topics=selected_topics,
            last_search_until=period_to,
        )
        return result
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        save_digest_state(status="error", error=message, topics=selected_topics)
        raise
