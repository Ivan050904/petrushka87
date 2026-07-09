from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.transcription import TranscriptionJob
from app.schemas.entry import EntryType


def _clip_title(value: str) -> str:
    candidate = value.strip() or "Видео"
    return candidate[:157] + "..." if len(candidate) > 160 else candidate


def sync_entry_for_job(db: Session, job: TranscriptionJob) -> Entry:
    """Create or update a knowledge-stream entry linked to a transcription job."""
    title = _clip_title(job.title or job.url)
    summary_text = (job.summary or "").strip()
    content = summary_text or job.url
    metadata = {
        "job_id": job.id,
        "url": job.url,
        "status": job.status,
        "duration_sec": job.duration_sec,
        "source": job.source,
        "summary_model": job.summary_model,
    }

    entry: Entry | None = None
    if job.entry_id is not None:
        entry = db.get(Entry, job.entry_id)

    if entry is None:
        entry = Entry(
            user_id=job.user_id,
            type=EntryType.transcription.value,
            title=title,
            content=content[:50000],
            metadata_=metadata,
        )
        db.add(entry)
        db.flush()
        job.entry_id = entry.id
        return entry

    entry.type = EntryType.transcription.value
    entry.title = title
    if summary_text:
        entry.content = content[:50000]
    entry.metadata_ = {**entry.metadata_, **metadata}
    db.add(entry)
    return entry
