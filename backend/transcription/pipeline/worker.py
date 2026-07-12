"""Фоновая обработка задачи: субтитры/Whisper -> пересказ."""

from __future__ import annotations

from datetime import datetime, timezone

from transcription.database import SessionLocal
from transcription.models import Job
from transcription.pipeline import opinions, subtitles, summarize, transcribe
from transcription.pipeline.ollama_client import current_model_name
from app.services.embeddings.indexer import index_transcription_job
from app.services.transcription.entry_sync import sync_entry_for_job


def _format_job_error(exc: Exception) -> str:
    msg = str(exc).strip()
    if "429" in msg or "Too Many Requests" in msg:
        return (
            "Превышен лимит запросов GitHub Models. "
            "Подожди 1–2 минуты и нажми «Попробовать снова», "
            "или укажи OPENAI_API_KEY для другого провайдера."
        )
    if "youtube" in msg.lower() and ("timed out" in msg.lower() or "timeout" in msg.lower()):
        return f"YouTube: {msg}"
    if "sign in to confirm" in msg.lower() or "not a bot" in msg.lower():
        return (
            "YouTube заблокировал автоматический доступ. "
            "Войдите в YouTube в Edge на этом компьютере, перезапустите backend и попробуйте снова. "
            "Либо экспортируйте cookies в backend/storage/youtube-cookies.txt (см. .env.example)."
        )
    if "cookie" in msg.lower() and (
        "could not copy" in msg.lower()
        or "permission denied" in msg.lower()
        or "being used by another process" in msg.lower()
    ):
        return (
            "Не удалось прочитать cookies из браузера — закрой все окна Chrome/Edge и нажми «Попробовать снова». "
            "Надёжнее: войди в YouTube в Edge (не Chrome) или положи cookies.txt в "
            "backend/storage/youtube-cookies.txt."
        )
    if msg.startswith("Превышен лимит"):
        return msg
    if len(msg) > 500:
        return msg[:497] + "..."
    return msg or "Что-то пошло не так."


def _update(db, job: Job, **fields) -> None:
    for key, value in fields.items():
        setattr(job, key, value)
    db.commit()


def process_job(job_id: int) -> None:
    db = SessionLocal()
    audio_path = None
    try:
        job = db.get(Job, job_id)
        if job is None:
            return

        mode = job.reprocess_mode or "full"
        llm_only = mode == "llm" and bool((job.transcript or "").strip())

        def set_progress(pct: int, stage: str, stage_key: str, **extra) -> None:
            db.refresh(job)
            _update(db, job, progress=pct, stage=stage, stage_key=stage_key, **extra)

        if not llm_only:
            set_progress(
                5,
                "Получаю данные видео",
                "metadata",
                status="processing",
                processing_started_at=datetime.now(timezone.utc),
            )

            info = subtitles.get_video_info(job.url)
            title = info.get("title") or ""
            duration_sec = int(info.get("duration") or 0)
            set_progress(10, "Ищу субтитры", "subtitles", title=title, duration_sec=duration_sec)
            sync_entry_for_job(db, job)
            db.commit()

            text = subtitles.fetch_subtitles(job.url, info=info)
            if text:
                set_progress(25, "Субтитры найдены", "subtitles", source="subtitles")
            else:
                set_progress(15, "Субтитров нет, скачиваю аудио", "whisper", source="whisper")
                audio_path = subtitles.download_audio(job.url)
                set_progress(35, "Распознаю речь (это может занять время)", "whisper")
                text = transcribe.transcribe_audio(audio_path)
                set_progress(50, "Речь распознана", "whisper")

            if not text or not text.strip():
                set_progress(0, "Ошибка", "metadata", status="error", error="Не удалось получить текст видео.")
                return

            set_progress(55, "Готовлю пересказ", "summary", transcript=text)
            duration_sec = job.duration_sec
        else:
            text = job.transcript.strip()
            duration_sec = job.duration_sec
            set_progress(
                55,
                "Готовлю пересказ",
                "summary",
                status="processing",
                processing_started_at=job.processing_started_at or datetime.now(timezone.utc),
            )

        def on_summary_progress(pct: int, stage: str) -> None:
            set_progress(pct, stage, "summary")

        result = summarize.summarize(
            text,
            duration_sec=duration_sec or None,
            on_progress=on_summary_progress,
        )

        set_progress(90, "Пересказ готов", "summary", summary=result)

        def on_opinions_progress(pct: int, stage: str) -> None:
            set_progress(pct, stage, "opinions")

        opinions_text = opinions.extract_opinions(
            text,
            duration_sec=duration_sec or None,
            on_progress=on_opinions_progress,
        )

        set_progress(
            100,
            "Готово",
            "done",
            opinions=opinions_text,
            status="done",
            summary_model=current_model_name(),
            reprocess_mode="",
        )
        sync_entry_for_job(db, job)
        index_transcription_job(db, job)
        db.commit()

    except Exception as exc:  # noqa: BLE001
        try:
            job = db.get(Job, job_id)
            if job is not None:
                _update(
                    db,
                    job,
                    status="error",
                    stage="Ошибка",
                    stage_key=job.stage_key or "metadata",
                    error=_format_job_error(exc)[:2000],
                    reprocess_mode="",
                )
        except Exception:
            pass
    finally:
        if audio_path is not None:
            try:
                audio_path.unlink(missing_ok=True)
            except Exception:
                pass
        db.close()
