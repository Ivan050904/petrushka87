"""Расчёт ETA и состояния этапов обработки видео."""

from __future__ import annotations

from datetime import datetime, timezone

from transcription.config import settings
from transcription.models import Job

STAGE_ORDER = ("metadata", "subtitles", "whisper", "summary", "opinions", "done")

STEP_LABELS = {
    "subtitles": "Субтитры",
    "whisper": "Whisper",
    "summary": "Пересказ",
    "opinions": "Позиции",
}


def estimate_total_sec(job: Job) -> int:
    """Примерное полное время обработки в секундах."""
    duration = max(0, job.duration_sec or 0)
    whisper_sec = 0 if job.source == "subtitles" else int(duration * settings.eta_whisper_factor)
    return (
        settings.eta_metadata_sec
        + settings.eta_subtitles_sec
        + whisper_sec
        + max(settings.eta_summary_min_sec, int(duration * settings.eta_summary_factor))
        + max(settings.eta_opinions_min_sec, int(duration * settings.eta_opinions_factor))
    )


def estimate_remaining_sec(job: Job) -> int:
    """Оставшееся время с учётом текущего прогресса."""
    total = estimate_total_sec(job)
    progress = max(0, min(100, job.progress or 0))
    if progress >= 100:
        return 0
    remaining = int(total * (100 - progress) / 100)
    return max(0, remaining)


def build_steps(job: Job) -> list[dict[str, str]]:
    """Список шагов для stepper UI."""
    current = job.stage_key or "metadata"
    skip_whisper = job.source == "subtitles" and current not in ("whisper",)
    keys = ["subtitles", "whisper", "summary", "opinions"]
    steps: list[dict[str, str]] = []

    current_idx = STAGE_ORDER.index(current) if current in STAGE_ORDER else 0

    for key in keys:
        if key == "whisper" and skip_whisper:
            steps.append({"key": key, "label": STEP_LABELS[key], "state": "skipped"})
            continue
        key_idx = STAGE_ORDER.index(key)
        if job.status == "done" or current == "done":
            state = "done"
        elif key_idx < current_idx:
            state = "done"
        elif key == current:
            state = "active"
        else:
            state = "pending"
        steps.append({"key": key, "label": STEP_LABELS[key], "state": state})

    return steps


def format_eta(sec: int) -> str:
    if sec < 10:
        return ""
    if sec < 60:
        return f"~{sec} сек"
    minutes = sec // 60
    if minutes < 60:
        return f"~{minutes} мин"
    h, m = divmod(minutes, 60)
    if m:
        return f"~{h} ч {m} мин"
    return f"~{h} ч"
