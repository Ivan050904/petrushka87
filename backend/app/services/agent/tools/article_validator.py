from __future__ import annotations

from collections.abc import Iterable

import httpx

from app.services.agent.tools.web_search import SearchResult

_TIMEOUT_SECONDS = 8.0


def is_reachable_article_url(url: str) -> bool:
    """Confirm that an article URL responds before it is shown to the user."""
    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=_TIMEOUT_SECONDS,
            headers={"User-Agent": "Folio-One/1.0 article-checker"},
        ) as client:
            response = client.head(url)
            if response.status_code in {405, 403}:
                with client.stream("GET", url) as fallback:
                    return 200 <= fallback.status_code < 400
            return 200 <= response.status_code < 400
    except httpx.HTTPError:
        return False


def filter_reachable_articles(
    candidates: Iterable[SearchResult],
    *,
    max_checks: int = 12,
) -> list[SearchResult]:
    reachable: list[SearchResult] = []
    for candidate in candidates:
        if max_checks <= 0:
            break
        max_checks -= 1
        if is_reachable_article_url(candidate.url):
            reachable.append(candidate)
    return reachable
