from __future__ import annotations

import html
import re
import time
from datetime import date, datetime

import httpx

from app.services.agent.tools.web_search import SearchResult

HABR_API_URL = "https://habr.com/kek/v2/articles/"
DEFAULT_MAX_PAGES = 5
DEFAULT_PAUSE_SECONDS = 0.5


def _strip_html(value: str) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", html.unescape(value))
    return re.sub(r"\s+", " ", cleaned).strip()


def _parse_published_at(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _habr_article_url(publication_id: str) -> str:
    return f"https://habr.com/ru/articles/{publication_id}/"


def habr_search(
    query: str,
    *,
    date_from: date,
    date_to: date,
    max_results: int = 20,
    max_pages: int = DEFAULT_MAX_PAGES,
    pause_seconds: float = DEFAULT_PAUSE_SECONDS,
) -> list[SearchResult]:
    cleaned_query = query.strip()
    if not cleaned_query:
        return []

    results: list[SearchResult] = []
    seen_urls: set[str] = set()

    for page in range(1, max_pages + 1):
        if len(results) >= max_results:
            break

        if page > 1:
            time.sleep(pause_seconds)

        try:
            response = httpx.get(
                HABR_API_URL,
                params={
                    "query": cleaned_query,
                    "order": "date",
                    "fl": "ru",
                    "hl": "ru",
                    "page": page,
                },
                headers={"User-Agent": "Folio-One-Digest/1.0"},
                timeout=20,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError:
            break

        publication_ids = payload.get("publicationIds") or payload.get("articleIds") or []
        publication_refs = payload.get("publicationRefs") or payload.get("articleRefs") or {}
        if not publication_ids:
            break

        stop_pagination = False

        for publication_id in publication_ids:
            ref = publication_refs.get(str(publication_id)) or publication_refs.get(publication_id)
            if not isinstance(ref, dict):
                continue

            published_at = _parse_published_at(str(ref.get("timePublished") or ""))
            if published_at is None:
                continue

            published_date = published_at.date()
            if published_date < date_from:
                stop_pagination = True
                continue
            if published_date > date_to:
                continue

            title = _strip_html(str(ref.get("titleHtml") or ""))
            lead_data = ref.get("leadData")
            snippet = ""
            if isinstance(lead_data, dict):
                snippet = _strip_html(str(lead_data.get("textHtml") or ""))

            url = _habr_article_url(str(ref.get("id") or publication_id))
            if not title or url in seen_urls:
                continue

            seen_urls.add(url)
            results.append(
                SearchResult(
                    title=title[:160],
                    url=url,
                    snippet=snippet[:500],
                    query=cleaned_query,
                    published_at=published_date.isoformat(),
                    source_site="habr.com",
                )
            )
            if len(results) >= max_results:
                break

        if stop_pagination:
            break

        pages_count = int(payload.get("pagesCount") or 0)
        if pages_count and page >= pages_count:
            break

    return results
