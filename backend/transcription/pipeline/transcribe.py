"""Распознавание речи из аудио через faster-whisper.

Модель загружается один раз и держится в памяти (лениво, при первом вызове),
чтобы не тратить время на повторную загрузку.
"""

from __future__ import annotations

from pathlib import Path

from transcription.config import settings

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        _model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
    return _model


def transcribe_audio(audio_path: Path, lang: str | None = None) -> str:
    """Возвращает распознанный текст из аудиофайла."""
    model = _get_model()
    language = None if (lang or settings.default_language) == "auto" else (lang or settings.default_language)

    segments, _info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=True,  # отсекает тишину, ускоряет длинные видео
    )
    parts = [seg.text.strip() for seg in segments]
    return " ".join(p for p in parts if p).strip()
