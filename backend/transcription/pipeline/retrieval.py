"""Поиск релевантных фрагментов транскрипта для Q&A (BM25)."""

from __future__ import annotations

import re
from functools import lru_cache

from rank_bm25 import BM25Okapi

CHUNK_SIZE = 1500
CHUNK_OVERLAP = 200
TOP_K = 5
CONTEXT_LIMIT = 16000

_TOKEN_RE = re.compile(r"[a-zA-Zа-яА-ЯёЁ0-9]+")


def _normalize(text: str) -> str:
    return text.lower().replace("ё", "е")


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(_normalize(text))


def chunk_transcript(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Разбивает транскрипт на перекрывающиеся куски."""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]

    words = text.split()
    chunks: list[str] = []
    current: list[str] = []
    length = 0

    for word in words:
        if length + len(word) + 1 > size and current:
            chunks.append(" ".join(current))
            overlap_words = current[-max(1, overlap // 8) :]
            current = list(overlap_words)
            length = sum(len(w) + 1 for w in current)
        current.append(word)
        length += len(word) + 1

    if current:
        chunk = " ".join(current)
        if not chunks or chunks[-1] != chunk:
            chunks.append(chunk)

    return chunks


def retrieve(query: str, chunks: list[str], k: int = TOP_K) -> list[str]:
    if not chunks:
        return []
    if len(chunks) <= k:
        return chunks

    tokenized = [_tokenize(c) for c in chunks]
    if not any(tokenized):
        return chunks[:k]

    bm25 = BM25Okapi(tokenized)
    scores = bm25.get_scores(_tokenize(query))
    ranked = sorted(range(len(chunks)), key=lambda i: scores[i], reverse=True)
    return [chunks[i] for i in ranked[:k]]


@lru_cache(maxsize=128)
def _cached_chunks(transcript: str) -> tuple[str, ...]:
    return tuple(chunk_transcript(transcript))


def get_relevant_chunks(transcript: str, query: str, k: int = TOP_K) -> list[str]:
    chunks = list(_cached_chunks(transcript))
    return retrieve(query, chunks, k=k)


def build_transcript_context(transcript: str, query: str, budget: int = CONTEXT_LIMIT) -> str:
    """Собирает контекст из релевантных чанков в пределах лимита символов."""
    chunks = get_relevant_chunks(transcript, query)
    if not chunks:
        return ""

    parts: list[str] = []
    used = 0
    for i, chunk in enumerate(chunks, 1):
        header = f"[Фрагмент {i}]\n"
        block = header + chunk
        if used + len(block) + 2 > budget:
            remaining = budget - used - len(header) - 2
            if remaining > 200:
                parts.append(header + chunk[:remaining] + "…")
            break
        parts.append(block)
        used += len(block) + 2

    return "\n\n".join(parts)
