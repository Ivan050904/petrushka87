from __future__ import annotations

from collections.abc import Callable

from pydantic import ValidationError

from app.schemas.therapy_session import TherapySessionAnalysis
from app.services.ai.prompts.therapy_session_analyze import THERAPY_SESSION_ANALYZE_SYSTEM_PROMPT
from app.services.therapy_sessions.llm_client import (
    TherapyLLMUnavailableError,
    therapy_generate_json,
)
from transcription.pipeline.text_chunks import CHUNK_CHARS, split_text

ProgressCallback = Callable[[int, str], None]


def _analyze_chunk(chunk: str) -> dict:
    prompt = (
        "Проанализируй фрагмент терапевтической сессии. "
        "Верни JSON по схеме из system prompt.\n\n"
        f"{chunk}"
    )
    return therapy_generate_json(prompt, system=THERAPY_SESSION_ANALYZE_SYSTEM_PROMPT)


def _merge_analyses(partials: list[dict]) -> TherapySessionAnalysis:
    if not partials:
        raise TherapyLLMUnavailableError("No partial analyses to merge")

    if len(partials) == 1:
        return TherapySessionAnalysis.model_validate(partials[0])

    merge_prompt = (
        "Ниже частичные JSON-анализы одной терапевтической сессии. "
        "Объедини их в один итоговый JSON по той же схеме. "
        "Убери дубли, сохрани лучшие цитаты.\n\n"
        + "\n\n---\n\n".join(str(item) for item in partials)
    )
    merged = therapy_generate_json(merge_prompt, system=THERAPY_SESSION_ANALYZE_SYSTEM_PROMPT)
    return TherapySessionAnalysis.model_validate(merged)


def analyze_therapy_session(
    diarized_transcript: str,
    *,
    duration_sec: int = 0,
    on_progress: ProgressCallback | None = None,
) -> TherapySessionAnalysis:
    text = diarized_transcript.strip()
    if not text:
        raise TherapyLLMUnavailableError("Transcript is empty for analysis")

    long_session = duration_sec >= 15 * 60 or len(text) > CHUNK_CHARS
    if not long_session:
        if on_progress:
            on_progress(70, "Психологический анализ")
        try:
            payload = therapy_generate_json(
                f"Расшифровка терапевтической сессии:\n\n{text}",
                system=THERAPY_SESSION_ANALYZE_SYSTEM_PROMPT,
            )
            return TherapySessionAnalysis.model_validate(payload)
        except ValidationError as exc:
            raise TherapyLLMUnavailableError("Analysis JSON did not match schema") from exc

    chunks = split_text(text, size=CHUNK_CHARS)
    partials: list[dict] = []
    total = len(chunks)
    for index, chunk in enumerate(chunks):
        if on_progress:
            pct = 58 + int((index / max(total, 1)) * 30)
            on_progress(pct, f"Анализ: часть {index + 1} из {total}")
        partials.append(_analyze_chunk(chunk))

    if on_progress:
        on_progress(92, "Собираю итоговый анализ")
    return _merge_analyses(partials)
