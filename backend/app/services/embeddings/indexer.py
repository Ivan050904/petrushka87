from __future__ import annotations

import hashlib
import math
import uuid
from collections.abc import Iterable

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.entry_embedding import EntryEmbedding
from app.models.transcription import TranscriptionJob
from transcription.pipeline.retrieval import chunk_transcript

EMBEDDING_DIM = 256


def _tokenize(text: str) -> list[str]:
    return [token for token in text.lower().split() if token]


def _hash_embedding(text: str, *, dim: int = EMBEDDING_DIM) -> list[float]:
    """Deterministic lightweight embedding for local cosine search without sqlite-vec."""
    vector = [0.0] * dim
    tokens = _tokenize(text)
    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    if norm <= 0:
        return vector
    return [value / norm for value in vector]


def cosine_similarity(left: Iterable[float], right: Iterable[float]) -> float:
    left_list = list(left)
    right_list = list(right)
    if not left_list or not right_list or len(left_list) != len(right_list):
        return 0.0
    return sum(a * b for a, b in zip(left_list, right_list, strict=True))


def index_entry(db: Session, entry: Entry) -> int:
    db.execute(delete(EntryEmbedding).where(EntryEmbedding.entry_id == entry.id))

    text = f"{entry.title}\n{entry.content}".strip()
    if not text:
        return 0

    chunks = chunk_transcript(text, size=1200, overlap=150) or [text]
    for index, chunk in enumerate(chunks):
        db.add(
            EntryEmbedding(
                user_id=entry.user_id,
                entry_id=entry.id,
                chunk_index=index,
                source_type="entry",
                text_snippet=chunk[:4000],
                vector=_hash_embedding(chunk),
            )
        )
    return len(chunks)


def index_transcription_job(db: Session, job: TranscriptionJob) -> int:
    if job.entry_id is None:
        return 0

    db.execute(delete(EntryEmbedding).where(EntryEmbedding.entry_id == job.entry_id))

    chunks = chunk_transcript(job.transcript or job.summary or "", size=1500, overlap=200)
    if not chunks and job.summary:
        chunks = [job.summary]

    for index, chunk in enumerate(chunks):
        db.add(
            EntryEmbedding(
                user_id=job.user_id,
                entry_id=job.entry_id,
                chunk_index=index,
                source_type="transcription",
                text_snippet=chunk[:4000],
                vector=_hash_embedding(chunk),
            )
        )
    return len(chunks)


def search_embeddings(
    db: Session,
    *,
    user_id: uuid.UUID,
    query: str,
    limit: int = 10,
) -> list[EntryEmbedding]:
    query_vector = _hash_embedding(query)
    rows = db.scalars(select(EntryEmbedding).where(EntryEmbedding.user_id == user_id)).all()
    ranked = sorted(
        rows,
        key=lambda row: cosine_similarity(query_vector, row.vector or []),
        reverse=True,
    )
    return ranked[:limit]
