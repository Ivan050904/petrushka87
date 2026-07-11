from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings


@dataclass
class DiarizedSegment:
    start_sec: float
    speaker_id: str
    text: str


@dataclass
class TranscriptionResult:
    transcript: str
    segments: list[DiarizedSegment]
    source: str


_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel

        _whisper_model = WhisperModel(
            settings.therapy_whisper_model,
            device=settings.therapy_whisper_device,
            compute_type=settings.therapy_whisper_compute_type,
        )
    return _whisper_model


def _format_timestamp(seconds: float) -> str:
    total = int(seconds)
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def _whisperx_available() -> bool:
    try:
        import whisperx  # noqa: F401

        return bool(settings.hf_token.strip())
    except ImportError:
        return False


def _transcribe_whisperx(audio_path: Path) -> TranscriptionResult:
    import whisperx

    device = settings.therapy_whisper_device
    compute_type = settings.therapy_whisper_compute_type
    model = whisperx.load_model(settings.therapy_whisper_model, device, compute_type=compute_type)
    audio = whisperx.load_audio(str(audio_path))
    result = model.transcribe(audio, language="ru")
    model_a, metadata = whisperx.load_align_model(language_code="ru", device=device)
    aligned = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)
    diarize_model = whisperx.DiarizationPipeline(use_auth_token=settings.hf_token, device=device)
    diarize_segments = diarize_model(
        audio,
        min_speakers=settings.therapy_num_speakers,
        max_speakers=settings.therapy_num_speakers,
    )
    final = whisperx.assign_word_speakers(diarize_segments, aligned)

    segments: list[DiarizedSegment] = []
    parts: list[str] = []
    for segment in final.get("segments", []):
        text = str(segment.get("text", "")).strip()
        if not text:
            continue
        speaker = str(segment.get("speaker", "SPEAKER_00"))
        start = float(segment.get("start", 0))
        segments.append(DiarizedSegment(start_sec=start, speaker_id=speaker, text=text))
        parts.append(text)

    return TranscriptionResult(
        transcript=" ".join(parts).strip(),
        segments=segments,
        source="whisperx",
    )


def _transcribe_faster_whisper(audio_path: Path) -> TranscriptionResult:
    model = _get_whisper_model()
    whisper_segments, _info = model.transcribe(
        str(audio_path),
        language="ru",
        vad_filter=True,
    )
    segments: list[DiarizedSegment] = []
    parts: list[str] = []
    for segment in whisper_segments:
        text = segment.text.strip()
        if not text:
            continue
        segments.append(
            DiarizedSegment(
                start_sec=float(segment.start),
                speaker_id="SPEAKER_00",
                text=text,
            )
        )
        parts.append(text)
    return TranscriptionResult(
        transcript=" ".join(parts).strip(),
        segments=segments,
        source="whisper",
    )


def transcribe_with_diarization(audio_path: Path) -> TranscriptionResult:
    if settings.therapy_diarization_enabled and _whisperx_available():
        try:
            return _transcribe_whisperx(audio_path)
        except Exception:  # noqa: BLE001
            pass
    return _transcribe_faster_whisper(audio_path)


def format_diarized_transcript(
    segments: list[DiarizedSegment],
    speaker_roles: dict[str, str],
) -> str:
    role_labels = {
        "therapist": "Психолог",
        "client": "Клиент",
    }
    lines: list[str] = []
    for segment in segments:
        role = speaker_roles.get(segment.speaker_id, "unknown")
        label = role_labels.get(role, segment.speaker_id)
        timestamp = _format_timestamp(segment.start_sec)
        lines.append(f"[{timestamp}] {label}: {segment.text}")
    return "\n".join(lines)
