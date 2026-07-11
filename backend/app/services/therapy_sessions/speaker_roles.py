from __future__ import annotations

from app.services.ai.prompts.therapy_session_analyze import (
    DIARIZE_FALLBACK_PROMPT,
    SPEAKER_ROLE_ASSIGNMENT_PROMPT,
)
from app.services.therapy_sessions.llm_client import therapy_generate, therapy_generate_json
from app.services.therapy_sessions.transcribe_diarize import DiarizedSegment


def assign_speaker_roles(segments: list[DiarizedSegment]) -> dict[str, str]:
    speaker_ids = sorted({segment.speaker_id for segment in segments})
    if len(speaker_ids) <= 1:
        if speaker_ids:
            return {speaker_ids[0]: "client"}
        return {}

    sample_lines: list[str] = []
    for segment in segments[:80]:
        sample_lines.append(f"{segment.speaker_id}: {segment.text}")
    sample = "\n".join(sample_lines)

    try:
        payload = therapy_generate_json(
            f"{SPEAKER_ROLE_ASSIGNMENT_PROMPT}\n\n{sample}",
        )
    except Exception:  # noqa: BLE001
        return {speaker_ids[0]: "therapist", speaker_ids[1]: "client"}

    roles: dict[str, str] = {}
    for speaker_id in speaker_ids:
        raw = payload.get(speaker_id)
        if raw in {"therapist", "client"}:
            roles[speaker_id] = raw
    if len(roles) < len(speaker_ids):
        missing = [item for item in speaker_ids if item not in roles]
        defaults = ["therapist", "client"]
        for index, speaker_id in enumerate(missing):
            roles[speaker_id] = defaults[index % len(defaults)]
    return roles


def llm_diarize_plain_transcript(transcript: str) -> str:
    if not transcript.strip():
        return ""
    preview = transcript[:12000]
    try:
        return therapy_generate(f"{DIARIZE_FALLBACK_PROMPT}\n{preview}", temperature=0.2)
    except Exception:  # noqa: BLE001
        return transcript
