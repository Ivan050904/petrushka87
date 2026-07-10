from __future__ import annotations

import tempfile
from pathlib import Path

from app.core.config import settings

_model = None

ALLOWED_AUDIO_TYPES = {
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/mp3",
}


class SpeechUnavailableError(RuntimeError):
    pass


def speech_is_configured() -> bool:
    return settings.speech_enabled and bool(settings.whisper_model.strip())


def _get_model():
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise SpeechUnavailableError("faster-whisper is not installed") from exc

        _model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
    return _model


def transcribe_audio_bytes(
    audio_bytes: bytes,
    *,
    content_type: str | None = None,
    filename: str | None = None,
) -> str:
    if not speech_is_configured():
        raise SpeechUnavailableError("Speech recognition is disabled or not configured")

    if not audio_bytes:
        raise SpeechUnavailableError("Audio file is empty")

    if len(audio_bytes) > settings.speech_max_bytes:
        raise SpeechUnavailableError(
            f"Audio is too large (max {settings.speech_max_bytes // (1024 * 1024)} MB)"
        )

    if content_type and content_type.split(";", 1)[0].strip().lower() not in ALLOWED_AUDIO_TYPES:
        raise SpeechUnavailableError(f"Unsupported audio type: {content_type}")

    suffix = _suffix_for_filename(filename, content_type)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = Path(tmp.name)

    try:
        model = _get_model()
        language = settings.speech_language.strip() or None
        if language == "auto":
            language = None

        segments, _info = model.transcribe(
            str(tmp_path),
            language=language,
            vad_filter=True,
        )
        parts = [segment.text.strip() for segment in segments]
        text = " ".join(part for part in parts if part).strip()
        if not text:
            raise SpeechUnavailableError("Could not recognize speech in the recording")
        return text
    finally:
        tmp_path.unlink(missing_ok=True)


def _suffix_for_filename(filename: str | None, content_type: str | None) -> str:
    if filename and "." in filename:
        return Path(filename).suffix
    if content_type:
        normalized = content_type.split(";", 1)[0].strip().lower()
        mapping = {
            "audio/webm": ".webm",
            "audio/ogg": ".ogg",
            "audio/mp4": ".m4a",
            "audio/mpeg": ".mp3",
            "audio/mp3": ".mp3",
            "audio/wav": ".wav",
            "audio/x-wav": ".wav",
        }
        return mapping.get(normalized, ".webm")
    return ".webm"
