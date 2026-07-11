from __future__ import annotations

import uuid
from datetime import date
from typing import Literal
from urllib.parse import quote

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.entry import Entry
from app.models.therapy_session import TherapySessionJob
from app.models.user import User
from app.schemas.therapy_session import (
    TherapySessionJobRead,
    TherapySessionJobSummary,
    TherapySessionStatusRead,
)
from app.services.therapy_sessions.worker import process_therapy_session_job
from app.storage import get_file_storage

router = APIRouter()
storage = get_file_storage()

ALLOWED_EXTENSIONS = {".mp3", ".m4a", ".wav", ".ogg", ".webm", ".aac", ".flac", ".mp4"}
ALLOWED_CONTENT_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/webm",
    "audio/aac",
    "audio/flac",
    "video/mp4",
    "application/octet-stream",
}


async def _run_process_job(job_id: int) -> None:
    await run_in_threadpool(process_therapy_session_job, job_id)


def _serialize_job(job: TherapySessionJob) -> TherapySessionJobRead:
    return TherapySessionJobRead(
        id=job.id,
        title=job.title,
        session_date=job.session_date,
        status=job.status,
        stage=job.stage,
        stage_key=job.stage_key,
        progress=job.progress,
        source_filename=job.source_filename,
        duration_sec=job.duration_sec,
        transcription_source=job.transcription_source,
        transcript=job.transcript,
        diarized_transcript=job.diarized_transcript,
        speakers_json=job.speakers_json or {},
        analysis_json=job.analysis_json or {},
        analysis_markdown=job.analysis_markdown,
        analysis_model=job.analysis_model,
        error=job.error,
        entry_id=str(job.entry_id) if job.entry_id else None,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _serialize_summary(job: TherapySessionJob) -> TherapySessionJobSummary:
    return TherapySessionJobSummary(
        id=job.id,
        title=job.title,
        session_date=job.session_date,
        status=job.status,
        stage=job.stage,
        stage_key=job.stage_key,
        progress=job.progress,
        source_filename=job.source_filename,
        duration_sec=job.duration_sec,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _get_job(db: Session, user_id: uuid.UUID, job_id: int) -> TherapySessionJob:
    job = db.get(TherapySessionJob, job_id)
    if job is None or job.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return job


@router.get("", response_model=list[TherapySessionJobSummary])
def list_therapy_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TherapySessionJobSummary]:
    jobs = db.scalars(
        select(TherapySessionJob)
        .where(TherapySessionJob.user_id == current_user.id)
        .order_by(TherapySessionJob.created_at.desc())
        .limit(100)
    ).all()
    return [_serialize_summary(job) for job in jobs]


@router.post("", response_model=TherapySessionJobRead, status_code=status.HTTP_201_CREATED)
async def upload_therapy_session(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    session_date: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TherapySessionJobRead:
    if not settings.therapy_sessions_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Therapy sessions disabled")

    filename = file.filename or "session.mp3"
    extension = _extension(filename)
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Supported audio: MP3, M4A, WAV, OGG, WEBM, AAC, FLAC",
        )

    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type: {content_type}",
        )

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > settings.therapy_max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")

    parsed_date: date | None = None
    if session_date:
        try:
            parsed_date = date.fromisoformat(session_date.strip())
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid session_date") from exc

    stored_file = storage.save(
        file.file,
        filename=filename,
        content_type=content_type,
    )

    job = TherapySessionJob(
        user_id=current_user.id,
        title=title.strip() or _default_title(parsed_date, filename),
        session_date=parsed_date,
        status="queued",
        stage="В очереди",
        stage_key="upload",
        progress=0,
        source_filename=filename,
        file_storage_key=stored_file.key,
    )
    db.add(job)
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(stored_file.key)
        raise
    db.refresh(job)
    background_tasks.add_task(_run_process_job, job.id)
    return _serialize_job(job)


@router.get("/{job_id}", response_model=TherapySessionJobRead)
def get_therapy_session(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TherapySessionJobRead:
    job = _get_job(db, current_user.id, job_id)
    return _serialize_job(job)


@router.get("/{job_id}/status", response_model=TherapySessionStatusRead)
def get_therapy_session_status(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TherapySessionStatusRead:
    job = _get_job(db, current_user.id, job_id)
    return TherapySessionStatusRead(
        id=job.id,
        status=job.status,
        stage=job.stage,
        stage_key=job.stage_key,
        progress=job.progress,
        error=job.error,
    )


@router.post("/{job_id}/retry", response_model=TherapySessionJobRead)
async def retry_therapy_session(
    job_id: int,
    background_tasks: BackgroundTasks,
    mode: Literal["full", "analysis"] = Query(default="full"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TherapySessionJobRead:
    job = _get_job(db, current_user.id, job_id)
    if mode == "analysis" and not (job.diarized_transcript or job.transcript).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No transcript to re-analyze")

    job.status = "queued"
    job.stage = "В очереди"
    job.stage_key = "upload" if mode == "full" else "analysis"
    job.progress = 0
    job.error = ""
    job.reprocess_mode = mode
    if mode == "full":
        job.transcript = ""
        job.diarized_transcript = ""
        job.speakers_json = {}
        job.analysis_json = {}
        job.analysis_markdown = ""
    db.add(job)
    db.commit()
    db.refresh(job)
    background_tasks.add_task(_run_process_job, job.id)
    return _serialize_job(job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_therapy_session(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    job = _get_job(db, current_user.id, job_id)
    if job.file_storage_key:
        try:
            storage.delete(job.file_storage_key)
        except (FileNotFoundError, ValueError):
            pass
    if job.entry_id is not None:
        entry = db.get(Entry, job.entry_id)
        if entry is not None and entry.user_id == current_user.id:
            db.delete(entry)
    db.delete(job)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{job_id}/file")
def download_therapy_session_file(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    job = _get_job(db, current_user.id, job_id)
    if not job.file_storage_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    try:
        stored = storage.open(job.file_storage_key)
    except (FileNotFoundError, ValueError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    filename = job.source_filename or "session.mp3"
    return StreamingResponse(
        _stream_file(stored),
        media_type="application/octet-stream",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


def _extension(filename: str) -> str:
    dot = filename.rfind(".")
    if dot == -1:
        return ""
    return filename[dot:].lower()


def _default_title(session_date: date | None, filename: str) -> str:
    if session_date:
        return f"Сессия {session_date.isoformat()}"
    return filename.rsplit(".", 1)[0] or "Сессия с психологом"


def _stream_file(file_obj):
    with file_obj:
        while chunk := file_obj.read(1024 * 1024):
            yield chunk


def _content_disposition(filename: str) -> str:
    quoted_filename = quote(filename)
    return f"attachment; filename*=UTF-8''{quoted_filename}"
