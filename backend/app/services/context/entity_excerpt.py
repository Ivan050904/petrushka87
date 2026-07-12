from __future__ import annotations

import re

from app.models.entry import Entry
from app.services.context.entry_rag_text import build_entry_rag_text


def _normalize(value: str) -> str:
    return value.lower().replace("ё", "е")


def entry_matches_terms(entry: Entry, terms: list[str]) -> bool:
    haystack = _normalize(build_entry_rag_text(entry))
    for term in terms:
        needle = _normalize(term.strip())
        if len(needle) >= 2 and needle in haystack:
            return True
    return False


def build_entity_excerpt(
    text: str,
    terms: list[str],
    *,
    radius: int = 220,
    max_chars: int = 900,
) -> str:
    normalized = _normalize(text)
    best_pos = -1
    best_term = ""
    for term in sorted(terms, key=len, reverse=True):
        needle = _normalize(term.strip())
        if len(needle) < 2:
            continue
        pos = normalized.find(needle)
        if pos >= 0 and (best_pos < 0 or pos < best_pos):
            best_pos = pos
            best_term = term

    if best_pos < 0:
        compact = re.sub(r"\n{3,}", "\n\n", text.strip())
        return compact[:max_chars] + ("…" if len(compact) > max_chars else "")

    start = max(0, best_pos - radius)
    end = min(len(text), best_pos + len(best_term) + radius)
    excerpt = text[start:end].strip()
    if start > 0:
        excerpt = f"…{excerpt}"
    if end < len(text):
        excerpt = f"{excerpt}…"
    if len(excerpt) > max_chars:
        rel = _normalize(excerpt).find(_normalize(best_term))
        if rel >= 0:
            half = max_chars // 2
            slice_start = max(0, rel - half)
            excerpt = excerpt[slice_start : slice_start + max_chars]
        else:
            excerpt = excerpt[:max_chars]
    return excerpt
