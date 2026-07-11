from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.therapy_session import TherapySessionJob
from app.services.context.context_models import ContextScope, ContextSnippet
from app.services.context.query_intent import QueryIntent
from app.services.context.retrievers.base import rank_candidates

SCOPE: ContextScope = "therapy"


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
        select(TherapySessionJob)
        .where(TherapySessionJob.user_id == user_id, TherapySessionJob.status == "done")
        .order_by(TherapySessionJob.updated_at.desc())
        .limit(100)
    ).all()

    candidates: list[tuple[str, ContextSnippet]] = []
    for job in jobs:
        text_parts = [job.title, job.analysis_markdown]
        transcript_preview = (job.diarized_transcript or job.transcript or "")[:6000]
        if transcript_preview:
            text_parts.append(transcript_preview)
        analysis = job.analysis_json or {}
        if isinstance(analysis, dict):
            for key in ("session_summary", "emotional_dynamics"):
                value = analysis.get(key)
                if isinstance(value, str) and value.strip():
                    text_parts.append(value.strip())
        text = "\n".join(part.strip() for part in text_parts if part and part.strip())
        if not text:
            continue
        session_date = job.session_date.isoformat() if job.session_date else None
        candidates.append(
            (
                text,
                ContextSnippet(
                    entry_id=job.entry_id,
                    job_id=job.id,
                    source="therapy",
                    title=job.title or job.source_filename,
                    text=text[:8000],
                    entry_date=session_date,
                    scope=SCOPE,
                ),
            )
        )

    return rank_candidates(db, user_id, query, candidates, scope=SCOPE, limit=limit)
