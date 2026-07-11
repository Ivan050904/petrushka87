from __future__ import annotations

import re
from urllib.parse import urlparse

from app.services.agent.tools.web_search import SearchResult

PSYCH_TRUSTED_DOMAINS: frozenset[str] = frozenset(
    {
        "cci.health.wa.gov.au",
        "nhs.uk",
        "mind.org.uk",
        "beckinstitute.org",
        "ncbi.nlm.nih.gov",
        "apa.org",
        "contextualscience.org",
        "psychologytools.com",
    }
)

PSYCH_POSITIVE_TERMS: tuple[str, ...] = (
    "psycholog",
    "therapy",
    "therapist",
    "cbt",
    "cognitive",
    "thought record",
    "unhelpful thinking",
    "distortion",
    "behavioral",
    "behaviour",
    "schema",
    "distortion",
    "mindfulness",
    "anxiety",
    "depression",
    "self-worth",
    "self-esteem",
    "interpersonal",
    "emotion",
    "mental health",
    "counsel",
    "beck",
    "act ",
    "dbt",
    "rebt",
    "attachment",
    "trauma",
    "wellbeing",
    "well-being",
)

PSYCH_NEGATIVE_TERMS: tuple[str, ...] = (
    "shopify",
    "ecommerce",
    "e-commerce",
    "dropship",
    "profit margin",
    "high margin",
    "flip for profit",
    "affiliate marketing",
    "seo ",
    "amazon fba",
    "make money",
    "side hustle",
    "cryptocurrency",
    "forex",
    "stock trading",
    "real estate investing",
)

PSYCH_TOPIC_TERMS: tuple[str, ...] = (
    "cbt",
    "cognitive",
    "self-worth",
    "self esteem",
    "self-esteem",
    "self criticism",
    "self-criticism",
    "schema",
    "attachment",
    "relationship",
    "boundar",
    "act ",
    "acceptance",
    "experiential avoidance",
)

_UNSUPPORTED_ARTICLE_EXTENSIONS: tuple[str, ...] = (".pdf", ".doc", ".docx", ".xls", ".xlsx")


def _normalize_host(url: str) -> str:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    if host.startswith("pubmed."):
        return "ncbi.nlm.nih.gov"
    if host.startswith("pmc."):
        return "ncbi.nlm.nih.gov"
    if host.startswith("psycnet."):
        return "apa.org"
    return host


def _haystack(result: SearchResult) -> str:
    return f"{result.title} {result.snippet} {result.url}".lower()


def is_allowed_psych_source(url: str, *, allow_custom_source: bool = False) -> bool:
    host = _normalize_host(url)
    if allow_custom_source:
        return bool(host)
    return any(host == domain or host.endswith(f".{domain}") for domain in PSYCH_TRUSTED_DOMAINS)


def is_safe_psych_search_query(query: str) -> bool:
    match = re.search(r"(?:^|\s)site:([a-z0-9.-]+)", query.lower())
    if not match:
        return False
    host = match.group(1).removeprefix("www.")
    source_allowed = any(
        host == domain or host.endswith(f".{domain}") for domain in PSYCH_TRUSTED_DOMAINS
    )
    return source_allowed and any(term in query.lower() for term in PSYCH_TOPIC_TERMS)


def is_psych_relevant(result: SearchResult, *, allow_custom_source: bool = False) -> bool:
    text = _haystack(result)

    if any(term in text for term in PSYCH_NEGATIVE_TERMS):
        return False

    host = _normalize_host(result.url)
    path = urlparse(result.url).path.lower()
    if (path.endswith(_UNSUPPORTED_ARTICLE_EXTENSIONS) and host != "cci.health.wa.gov.au") or (
        "/media/" in path and host != "cci.health.wa.gov.au"
    ):
        return False

    return is_allowed_psych_source(result.url, allow_custom_source=allow_custom_source) and any(
        term in text for term in PSYCH_TOPIC_TERMS
    )


def filter_psych_candidates(
    candidates: list[SearchResult],
    *,
    allow_custom_sources: bool = False,
) -> list[SearchResult]:
    return [
        item for item in candidates if is_psych_relevant(item, allow_custom_source=allow_custom_sources)
    ]
