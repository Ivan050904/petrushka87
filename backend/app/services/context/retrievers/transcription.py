from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.transcription import TranscriptionJob
from app.services.context.context_models import ContextScope, ContextSnippet
from app.services.context.query_intent import QueryIntent
from app.services.context.retrievers.base import rank_candidates

SCOPE: ContextScope = "transcription"


def retrieve(
    db: Session,
    user_id: uuid.UUID,
    query: str,
    *,
    intent: QueryIntent,
    limit: int,
    primary_entry_id: uuid.UUID | None = None,
) -> list[ContextSnippet]:
    del intent, primary_entry_id
    jobs = db.scalars(
        select(TranscriptionJob)
        .where(TranscriptionJob.user_id == user_id, TranscriptionJob.status == "done")
        .order_by(TranscriptionJob.updated_at.desc())
        .limit(100)
    ).all()

    candidates: list[tuple[str, ContextSnippet]] = []
    for job in jobs:
        text_parts = [job.title, job.summary, job.opinions]
        transcript_preview = (job.transcript or "")[:6000]
        if transcript_preview:
            text_parts.append(transcript_preview)
        text = "\n".join(part.strip() for part in text_parts if part and part.strip())
        if not text:
            continue
        candidates.append(
            (
                text,
                ContextSnippet(
                    entry_id=job.entry_id,
                    job_id=job.id,
                    source="transcription",
                    title=job.title or job.url,
                    text=text[:8000],
                    scope=SCOPE,
                ),
            )
        )

    return rank_candidates(db, user_id, query, candidates, scope=SCOPE, limit=limit)
