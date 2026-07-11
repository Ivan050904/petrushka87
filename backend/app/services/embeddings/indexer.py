from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.entry_embedding import EntryEmbedding
from app.models.therapy_session import TherapySessionJob
from app.models.transcription import TranscriptionJob
from app.services.context.context_models import scope_for_entry
from app.services.context.entry_rag_text import build_entry_rag_text
from app.services.embeddings.provider import cosine_similarity, embed_text, embed_texts
from transcription.pipeline.retrieval import chunk_transcript


def _entry_index_metadata(entry: Entry) -> dict[str, str | None]:
    metadata = entry.metadata_ or {}
    entry_date = metadata.get("entry_date") or metadata.get("session_date")
    collection = metadata.get("collection")
    return {
        "entry_type": entry.type,
        "scope": scope_for_entry(entry),
        "collection": collection if isinstance(collection, str) else None,
        "entry_date": entry_date if isinstance(entry_date, str) else None,
    }


def index_entry(db: Session, entry: Entry) -> int:
    db.execute(delete(EntryEmbedding).where(EntryEmbedding.entry_id == entry.id))

    text = build_entry_rag_text(entry).strip()
    if not text:
        return 0

    meta = _entry_index_metadata(entry)
    chunks = chunk_transcript(text, size=1200, overlap=150) or [text]
    vectors, _provider = embed_texts(chunks)

    for index, chunk in enumerate(chunks):
        db.add(
            EntryEmbedding(
                user_id=entry.user_id,
                entry_id=entry.id,
                chunk_index=index,
                source_type="entry",
                text_snippet=chunk[:4000],
                vector=vectors[index] if index < len(vectors) else embed_text(chunk)[0],
                entry_type=meta["entry_type"],
                scope=meta["scope"],
                collection=meta["collection"],
                entry_date=meta["entry_date"],
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

    vectors, _provider = embed_texts(chunks)
    for index, chunk in enumerate(chunks):
        db.add(
            EntryEmbedding(
                user_id=job.user_id,
                entry_id=job.entry_id,
                chunk_index=index,
                source_type="transcription",
                text_snippet=chunk[:4000],
                vector=vectors[index] if index < len(vectors) else embed_text(chunk)[0],
                entry_type="transcription",
                scope="transcription",
            )
        )
    return len(chunks)


def index_therapy_session(db: Session, job: TherapySessionJob) -> int:
    if job.entry_id is None:
        return 0

    db.execute(delete(EntryEmbedding).where(EntryEmbedding.entry_id == job.entry_id))

    text_parts = [job.title, job.analysis_markdown, job.diarized_transcript, job.transcript]
    text = "\n".join(part.strip() for part in text_parts if part and part.strip())
    chunks = chunk_transcript(text, size=1500, overlap=200) or ([text] if text else [])

    session_date = job.session_date.isoformat() if job.session_date else None
    vectors, _provider = embed_texts(chunks)
    for index, chunk in enumerate(chunks):
        db.add(
            EntryEmbedding(
                user_id=job.user_id,
                entry_id=job.entry_id,
                chunk_index=index,
                source_type="therapy_session",
                text_snippet=chunk[:4000],
                vector=vectors[index] if index < len(vectors) else embed_text(chunk)[0],
                entry_type="therapy_session",
                scope="therapy",
                entry_date=session_date,
            )
        )
    return len(chunks)


def search_embeddings(
    db: Session,
    *,
    user_id: uuid.UUID,
    query: str,
    limit: int = 10,
    scopes: list[str] | None = None,
) -> list[EntryEmbedding]:
    query_vector, _provider = embed_text(query)
    statement = select(EntryEmbedding).where(EntryEmbedding.user_id == user_id)
    if scopes:
        statement = statement.where(EntryEmbedding.scope.in_(scopes))
    rows = db.scalars(statement).all()
    ranked = sorted(
        rows,
        key=lambda row: cosine_similarity(query_vector, row.vector or [])
        if row.vector and len(row.vector) == len(query_vector)
        else 0.0,
        reverse=True,
    )
    return ranked[:limit]
