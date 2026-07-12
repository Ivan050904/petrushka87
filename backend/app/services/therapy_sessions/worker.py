from __future__ import annotations

import tempfile
from datetime import UTC, datetime
from pathlib import Path

from app.db.session import SessionLocal
from app.models.therapy_session import TherapySessionJob
from app.services.embeddings.indexer import index_therapy_session
from app.services.therapy_sessions.analysis_markdown import analysis_to_markdown
from app.services.therapy_sessions.audio_utils import probe_audio_duration_sec
from app.services.therapy_sessions.entry_sync import sync_entry_for_job
from app.services.therapy_sessions.llm_client import current_model_name
from app.services.therapy_sessions.psych_analyze import analyze_therapy_session
from app.services.therapy_sessions.speaker_roles import (
    assign_speaker_roles,
    llm_diarize_plain_transcript,
)
from app.services.therapy_sessions.transcribe_diarize import (
    format_diarized_transcript,
    transcribe_with_diarization,
)
from app.storage import get_file_storage


def _format_job_error(exc: Exception) -> str:
    msg = str(exc).strip()
    if "429" in msg or "Too Many Requests" in msg:
        return "Превышен лимит запросов LLM. Подождите 1–2 минуты и нажмите «Попробовать снова»."
    if len(msg) > 500:
        return msg[:497] + "..."
    return msg or "Что-то пошло не так."


def _update(db, job: TherapySessionJob, **fields) -> None:
    for key, value in fields.items():
        setattr(job, key, value)
    db.commit()


def _is_text_import_job(job: TherapySessionJob) -> bool:
    return job.transcription_source == "text" or (
        not job.file_storage_key and bool(job.transcript.strip())
    )


def process_therapy_session_job(job_id: int) -> None:
    db = SessionLocal()
    storage = get_file_storage()
    temp_path: Path | None = None
    try:
        job = db.get(TherapySessionJob, job_id)
        if job is None:
            return

        mode = job.reprocess_mode or "full"
        analysis_only = mode == "analysis" and bool((job.diarized_transcript or job.transcript).strip())

        def set_progress(pct: int, stage: str, stage_key: str, **extra) -> None:
            db.flush()
            db.refresh(job)
            _update(db, job, progress=pct, stage=stage, stage_key=stage_key, **extra)

        if not analysis_only:
            set_progress(
                5,
                "Подготавливаю" if _is_text_import_job(job) else "Подготавливаю аудио",
                "upload",
                status="processing",
                processing_started_at=datetime.now(UTC),
            )

            if _is_text_import_job(job):
                if not job.transcript.strip():
                    set_progress(0, "Ошибка", "upload", status="error", error="Текст сессии пуст.")
                    return

                set_progress(25, "Размечаю спикеров", "speakers")
                sync_entry_for_job(db, job)
                db.commit()
                job.diarized_transcript = llm_diarize_plain_transcript(job.transcript)
                job.speakers_json = {"mode": "text_import"}
                if not job.diarized_transcript.strip():
                    set_progress(
                        0,
                        "Ошибка",
                        "transcribe",
                        status="error",
                        error="Не удалось обработать текст сессии.",
                    )
                    return
                set_progress(55, "Текст готов", "speakers")
            elif not job.file_storage_key:
                set_progress(0, "Ошибка", "upload", status="error", error="Файл сессии не найден.")
                return
            else:
                stored = storage.open(job.file_storage_key)
                suffix = Path(job.source_filename).suffix or ".mp3"
                with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                    temp_path = Path(tmp.name)
                    while chunk := stored.read(1024 * 1024):
                        tmp.write(chunk)
                stored.close()

                duration_sec = probe_audio_duration_sec(temp_path)
                if duration_sec:
                    job.duration_sec = duration_sec

                set_progress(15, "Распознаю речь", "transcribe")
                sync_entry_for_job(db, job)
                db.commit()

                result = transcribe_with_diarization(temp_path)
                job.transcript = result.transcript
                job.transcription_source = result.source

                set_progress(45, "Определяю спикеров", "speakers")
                if result.source == "whisper" or len({segment.speaker_id for segment in result.segments}) <= 1:
                    job.diarized_transcript = llm_diarize_plain_transcript(result.transcript)
                    job.speakers_json = {"mode": "llm_fallback"}
                else:
                    speaker_roles = assign_speaker_roles(result.segments)
                    job.speakers_json = speaker_roles
                    job.diarized_transcript = format_diarized_transcript(result.segments, speaker_roles)

                if not job.diarized_transcript.strip():
                    set_progress(0, "Ошибка", "transcribe", status="error", error="Не удалось получить текст сессии.")
                    return

                set_progress(55, "Транскрипт готов", "speakers")
        else:
            set_progress(
                55,
                "Пересчитываю анализ",
                "analysis",
                status="processing",
                processing_started_at=job.processing_started_at or datetime.now(UTC),
            )

        def on_analysis_progress(pct: int, stage: str) -> None:
            set_progress(pct, stage, "analysis")

        analysis = analyze_therapy_session(
            job.diarized_transcript,
            duration_sec=job.duration_sec,
            on_progress=on_analysis_progress,
        )
        job.analysis_json = analysis.model_dump()
        job.analysis_markdown = analysis_to_markdown(analysis)
        job.analysis_model = current_model_name()

        set_progress(96, "Индексирую для поиска", "index")
        sync_entry_for_job(db, job)
        index_therapy_session(db, job)
        db.commit()

        set_progress(100, "Готово", "done", status="done", error="")
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        job = db.get(TherapySessionJob, job_id)
        if job is not None:
            _update(
                db,
                job,
                status="error",
                stage="Ошибка",
                stage_key="upload",
                progress=0,
                error=_format_job_error(exc),
            )
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)
        db.close()
