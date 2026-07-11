from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.therapy_session import TherapySessionJob
from app.schemas.entry import EntryType


def _clip_title(value: str) -> str:
    candidate = value.strip() or "Сессия с психологом"
    return candidate[:157] + "..." if len(candidate) > 160 else candidate


def sync_entry_for_job(db: Session, job: TherapySessionJob) -> Entry:
    title = _clip_title(job.title or job.source_filename or "Сессия с психологом")
    content = (job.analysis_markdown or job.diarized_transcript or job.transcript or title)[:50000]
    session_date = job.session_date.isoformat() if job.session_date else None
    metadata = {
        "job_id": job.id,
        "session_date": session_date,
        "status": job.status,
        "duration_sec": job.duration_sec,
        "transcription_source": job.transcription_source,
        "analysis_model": job.analysis_model,
        "source_filename": job.source_filename,
    }

    entry: Entry | None = None
    if job.entry_id is not None:
        entry = db.get(Entry, job.entry_id)

    if entry is None:
        entry = Entry(
            user_id=job.user_id,
            type=EntryType.therapy_session.value,
            title=title,
            content=content,
            metadata_=metadata,
        )
        db.add(entry)
        db.flush()
        job.entry_id = entry.id
        return entry

    entry.type = EntryType.therapy_session.value
    entry.title = title
    entry.content = content
    entry.metadata_ = {**entry.metadata_, **metadata}
    db.add(entry)
    return entry
