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
from app.services.agent.article_feedback import (
    FeedbackProfile,
    candidate_matches_negative_themes,
    load_feedback_profile,
)
from app.services.agent.digest_profiles import (
    DigestProfileName,
    collect_ai_candidates,
    collect_psychology_candidates,
    get_digest_profile,
)
from app.services.agent.llm import DigestLLMClient, check_ollama_health
from app.services.agent.state import load_digest_state, save_digest_state
from app.services.agent.tools.web_search import SearchResult
from app.services.ai.base import AIUnavailableError
from app.services.embeddings.indexer import index_entry


@dataclass
class DigestResult:
    status: str
    articles_saved: int
    articles_skipped: int
    topics: list[str]
    message: str
    search_period_from: str | None = None
    search_period_to: str | None = None
    profile: DigestProfileName = "ai"


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


def compute_force_refresh_date_range(*, today: date, lookback_days: int) -> SearchDateRange:
    return SearchDateRange(
        date_from=today - timedelta(days=max(lookback_days, 1)),
        date_to=today,
    )


def _serialize_candidates(
    candidates: list[SearchResult],
    *,
    tier_by_query: dict[str, str] | None = None,
) -> list[dict[str, str | None]]:
    tier_by_query = tier_by_query or {}
    return [
        {
            "title": item.title,
            "url": item.url,
            "snippet": item.snippet,
            "query": item.query,
            "published_at": item.published_at,
            "source_site": item.source_site,
            "article_tier": tier_by_query.get(item.query),
        }
        for item in candidates
    ]


def _prefilter_candidates(
    candidates: list[SearchResult],
    profile: FeedbackProfile,
) -> list[SearchResult]:
    if not profile.blocked_urls and not profile.negative_themes:
        return candidates

    filtered: list[SearchResult] = []
    for item in candidates:
        if item.url in profile.blocked_urls:
            continue
        haystack = f"{item.title} {item.snippet or ''}"
        if candidate_matches_negative_themes(haystack, profile.negative_themes):
            continue
        filtered.append(item)
    return filtered


def _feedback_examples(profile: FeedbackProfile, *, limit: int = 15) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    off_topic: list[dict[str, str]] = []
    disliked: list[dict[str, str]] = []
    for example in profile.examples[:limit]:
        compact = {
            "title": example.title,
            "summary": example.summary[:240],
            "reason": example.feedback,
        }
        if example.feedback == "off_topic":
            off_topic.append(compact)
        else:
            disliked.append(compact)
    return off_topic, disliked


def _filter_with_llm(
    candidates: list[SearchResult],
    *,
    max_articles: int,
    feedback_profile: FeedbackProfile | None,
    profile_name: DigestProfileName,
    tier_by_query: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    if not candidates:
        return []

    digest_profile = get_digest_profile(profile_name)
    profile = feedback_profile or FeedbackProfile()
    off_topic, disliked = _feedback_examples(profile)
    feedback_section = digest_profile.format_feedback_section(
        off_topic_examples=off_topic,
        disliked_examples=disliked,
    )
    system_prompt = digest_profile.filter_prompt_template.format(
        max_articles=max_articles,
        feedback_section=feedback_section,
    )
    user_prompt = (
        "Select the best articles from these candidates:\n"
        f"{_serialize_candidates(candidates, tier_by_query=tier_by_query)}"
    )

    if profile_name == "psychology" and settings.psych_digest_use_llm_filter:
        from app.services.agent.psych_llm import PsychDigestLLMClient

        llm = PsychDigestLLMClient()
        payload = llm.complete_json(system_prompt=system_prompt, user_prompt=user_prompt)
    else:
        llm = DigestLLMClient()
        if not llm.is_configured():
            raise AIUnavailableError("Digest LLM is not configured")
        payload = llm.complete_json(system_prompt=system_prompt, user_prompt=user_prompt)

    articles = payload.get("articles")
    if not isinstance(articles, list):
        return []
    return [item for item in articles if isinstance(item, dict)]


def _direct_filter(
    candidates: list[SearchResult],
    *,
    max_articles: int,
    tier_by_query: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    tier_by_query = tier_by_query or {}
    selected: list[dict[str, Any]] = []
    for item in candidates[:max_articles]:
        selected.append(
            {
                "title": item.title,
                "url": item.url,
                "snippet": item.snippet or item.title,
                "query": item.query,
                "published_at": item.published_at,
                "source_site": item.source_site,
                "article_tier": tier_by_query.get(item.query),
            }
        )
    return selected


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
    digest_profile_name: DigestProfileName,
) -> tuple[int, int]:
    digest_profile = get_digest_profile(digest_profile_name)
    saved = 0
    skipped = 0
    created_entries: list[Entry] = []

    for article in articles:
        is_psych = digest_profile_name == "psychology"
        title = str(article.get("title") or article.get("title_ru") or "").strip()
        url = str(article.get("url") or "").strip()
        if is_psych:
            summary = str(article.get("snippet") or article.get("title") or "").strip()
        else:
            summary = str(article.get("summary_ru") or article.get("snippet") or title).strip()
        query = str(article.get("query") or "").strip()
        if not title or not url or not summary:
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

        metadata: dict[str, Any] = {
            "kind": "article",
            "collection": digest_profile.metadata_collection,
            "url": url,
            "source": digest_profile.metadata_source,
            "discovered_at": discovered_at,
            "query": query or None,
            "description": summary or None,
            "published_at": published_at,
            "source_site": source_site,
            "search_period_from": search_period_from,
            "search_period_to": search_period_to,
        }
        if is_psych:
            metadata["source_language"] = "en"
            metadata["snippet_en"] = summary or None
            metadata["article_access_checked"] = True
            article_tier = str(article.get("article_tier") or "").strip()
            if article_tier:
                metadata["article_tier"] = article_tier
        else:
            metadata["summary_ru"] = summary or None

        entry = Entry(
            user_id=user_id,
            type=EntryType.resource.value,
            title=title[:160],
            content=summary or title,
            metadata_=normalize_metadata(EntryType.resource, metadata),
        )
        db.add(entry)
        created_entries.append(entry)
        existing_urls.add(url)
        saved += 1

    if saved:
        db.commit()
        for entry in created_entries:
            db.refresh(entry)
            index_entry(db, entry)
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
    force: bool = False,
    profile: DigestProfileName = "ai",
) -> DigestResult:
    user = _resolve_user(db, user_id, user_email)
    digest_profile = get_digest_profile(profile)
    if not digest_profile.enabled:
        result = DigestResult(
            status="disabled",
            articles_saved=0,
            articles_skipped=0,
            topics=topics or digest_profile.default_topic_list(),
            message=f"Digest profile '{profile}' is disabled in configuration",
            profile=profile,
        )
        save_digest_state(
            user_id=user.id,
            profile=profile,
            status=result.status,
            error=result.message,
            topics=result.topics,
        )
        return result

    selected_topics = topics or digest_profile.default_topic_list()
    article_limit = max_articles or digest_profile.max_articles
    digest_state = load_digest_state(user.id, profile)
    today = _user_today()
    date_range = compute_search_date_range(
        today=today,
        last_search_until=digest_state.last_search_until,
        lookback_days=settings.digest_first_run_lookback_days,
    )

    if date_range is None:
        if force:
            date_range = compute_force_refresh_date_range(
                today=today,
                lookback_days=settings.digest_first_run_lookback_days,
            )
        else:
            result = DigestResult(
                status="up_to_date",
                articles_saved=0,
                articles_skipped=0,
                topics=selected_topics,
                message="Digest is already up to date for today",
                search_period_from=None,
                search_period_to=today.isoformat(),
                profile=profile,
            )
            save_digest_state(
                user_id=user.id,
                profile=profile,
                status=result.status,
                topics=selected_topics,
            )
            return result

    period_from = date_range.date_from.isoformat()
    period_to = date_range.date_to.isoformat()
    tier_by_query: dict[str, str] = {}

    try:
        if (
            not skip_health_check
            and digest_profile.requires_ollama_health
            and not check_ollama_health()
        ):
            raise AIUnavailableError("Ollama is not reachable. Start Ollama before running digest.")

        if profile == "psychology":
            candidates, tier_by_query = collect_psychology_candidates(selected_topics, user_id=user.id)
        else:
            candidates = collect_ai_candidates(
                selected_topics,
                date_from=date_range.date_from,
                date_to=date_range.date_to,
            )

        feedback_profile = load_feedback_profile(
            db,
            user.id,
            collection=digest_profile.metadata_collection,
        )
        candidates = _prefilter_candidates(candidates, feedback_profile)
        existing_urls = _existing_article_urls(db, user.id)
        if force:
            candidates = [item for item in candidates if item.url not in existing_urls]
        if not candidates:
            result = DigestResult(
                status="empty",
                articles_saved=0,
                articles_skipped=0,
                topics=selected_topics,
                message=(
                    "No new articles were found: search results are already saved or filtered out"
                    if force
                    else "No search results were found for the selected date range"
                ),
                search_period_from=period_from,
                search_period_to=period_to,
                profile=profile,
            )
            save_digest_state(
                user_id=user.id,
                profile=profile,
                status=result.status,
                topics=selected_topics,
                last_search_until=period_to if not force else digest_state.last_search_until,
            )
            return result

        if digest_profile.use_llm_filter:
            try:
                filtered = _filter_with_llm(
                    candidates,
                    max_articles=article_limit,
                    feedback_profile=feedback_profile,
                    profile_name=profile,
                    tier_by_query=tier_by_query,
                )
            except (AIUnavailableError, Exception):
                if digest_profile.allow_llm_fallback:
                    filtered = _fallback_filter(candidates, max_articles=article_limit)
                else:
                    raise
        else:
            filtered = _direct_filter(
                candidates,
                max_articles=article_limit,
                tier_by_query=tier_by_query,
            )

        discovered_at = _today_for_user()
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
            digest_profile_name=profile,
        )

        message = f"Saved {saved} articles, skipped {skipped}"
        if force and saved == 0:
            message = "No new articles were found: search results are already saved or filtered out"

        result = DigestResult(
            status="ok",
            articles_saved=saved,
            articles_skipped=skipped,
            topics=selected_topics,
            message=message,
            search_period_from=period_from,
            search_period_to=period_to,
            profile=profile,
        )
        save_digest_state(
            user_id=user.id,
            profile=profile,
            status=result.status,
            articles_saved=result.articles_saved,
            topics=selected_topics,
            last_search_until=period_to,
        )
        return result
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        save_digest_state(
            user_id=user.id,
            profile=profile,
            status="error",
            error=message,
            topics=selected_topics,
        )
        raise
