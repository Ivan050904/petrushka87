from __future__ import annotations

import time
from dataclasses import dataclass

from duckduckgo_search import DDGS
from duckduckgo_search.exceptions import DuckDuckGoSearchException


@dataclass(frozen=True)
class SearchResult:
    title: str
    url: str
    snippet: str
    query: str
    published_at: str | None = None
    source_site: str | None = None


def web_search(
    query: str,
    *,
    max_results: int = 8,
    pause_seconds: float = 1.0,
    site: str | None = None,
    timelimit: str | None = None,
) -> list[SearchResult]:
    cleaned_query = query.strip()
    if not cleaned_query:
        return []

    if site:
        cleaned_query = f"site:{site} {cleaned_query}"

    time.sleep(pause_seconds)
    try:
        kwargs: dict[str, object] = {"max_results": max_results}
        if timelimit:
            kwargs["timelimit"] = timelimit
        raw_results = DDGS().text(cleaned_query, **kwargs)
    except DuckDuckGoSearchException:
        return []

    results: list[SearchResult] = []
    seen_urls: set[str] = set()
    for item in raw_results:
        title = str(item.get("title") or "").strip()
        url = str(item.get("href") or item.get("url") or "").strip()
        snippet = str(item.get("body") or item.get("snippet") or "").strip()
        if not title or not url or url in seen_urls:
            continue
        seen_urls.add(url)
        results.append(
            SearchResult(
                title=title[:160],
                url=url,
                snippet=snippet[:500],
                query=cleaned_query,
            )
        )
    return results
