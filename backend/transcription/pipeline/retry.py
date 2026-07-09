"""Подготовка job к повторной обработке."""

from __future__ import annotations

from datetime import datetime, timezone

from transcription.models import Job

VALID_MODES = frozenset({"full", "llm"})


def prepare_retry(job: Job, mode: str = "llm") -> None:
    if mode not in VALID_MODES:
        raise ValueError("mode должен быть full или llm")
    if job.status == "processing":
        raise ValueError("Уже обрабатывается")
    if mode == "llm" and not (job.transcript or "").strip():
        mode = "full"

    job.status = "processing"
    job.progress = 0
    job.error = ""
    job.summary = ""
    job.opinions = ""
    job.stage = "В очереди"
    job.stage_key = "metadata"
    job.processing_started_at = datetime.now(timezone.utc)
    job.reprocess_mode = mode

    if mode == "full":
        job.transcript = ""
        job.source = ""
