"""Пересказ текста через Qwen (Ollama).

Не список пунктов, а связный текст своими словами с сохранением сути.
Длина зависит от длительности видео. Длинный текст режем на куски (map -> reduce).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from transcription.pipeline.ollama_client import chunk_chars, current_model_name, ollama_generate
from transcription.pipeline.text_chunks import CHUNK_CHARS, split_text

_STYLE = (
    "Пиши связным текстом абзацами, как будто пересказываешь другу. "
    "Без маркированных списков и нумерации. Без фраз вроде «в этом видео» или «автор говорит». "
    "Сохрани логику изложения и главные мысли."
)


@dataclass
class RetellingPlan:
    minutes: float
    words_min: int
    words_max: int
    chunk_words_min: int
    chunk_words_max: int


def estimate_minutes(duration_sec: int | None, text_len: int) -> float:
    if duration_sec and duration_sec > 0:
        return duration_sec / 60
    return max(1.0, text_len / 900)


def build_retelling_plan(duration_sec: int | None, text: str) -> RetellingPlan:
    """Сколько слов просить — чем длиннее видео, тем объёмнее пересказ."""
    minutes = estimate_minutes(duration_sec, len(text))

    if minutes <= 15:
        words_min, words_max = 180, 380
        chunk_min, chunk_max = 120, 220
    elif minutes <= 45:
        words_min, words_max = 400, 750
        chunk_min, chunk_max = 200, 350
    elif minutes <= 90:
        words_min, words_max = 750, 1300
        chunk_min, chunk_max = 300, 500
    else:
        words_min = max(1100, int(minutes * 12))
        words_max = min(2800, int(minutes * 20))
        chunk_min, chunk_max = 350, 600

    return RetellingPlan(minutes, words_min, words_max, chunk_min, chunk_max)


ProgressCallback = Callable[[int, str], None]


def summarize(
    text: str,
    duration_sec: int | None = None,
    on_progress: ProgressCallback | None = None,
) -> str:
    """Главная функция: полный текст -> связный пересказ."""
    text = text.strip()
    if not text:
        return "Не удалось получить текст для пересказа."

    plan = build_retelling_plan(duration_sec, text)
    chunks = split_text(text, size=chunk_chars())
    mins = int(plan.minutes)

    if len(chunks) <= 1:
        if on_progress:
            on_progress(70, "Пишу пересказ")
        prompt = (
            f"Перескажи содержание видео на русском языке своими словами. "
            f"Видео ~{mins} мин. Объём: примерно {plan.words_min}–{plan.words_max} слов. "
            f"{_STYLE}\n\n{text}"
        )
        return ollama_generate(prompt)

    partials: list[str] = []
    total = len(chunks)
    for i, chunk in enumerate(chunks):
        if on_progress:
            pct = 55 + int((i / total) * 35)
            on_progress(pct, f"Пересказ: часть {i + 1} из {total}")
        prompt = (
            f"Ниже фрагмент расшифровки видео (~{mins} мин). "
            f"Перескажи этот фрагмент на русском: {plan.chunk_words_min}–{plan.chunk_words_max} слов. "
            f"{_STYLE}\n\n{chunk}"
        )
        partials.append(ollama_generate(prompt))

    combined = "\n\n".join(partials)

    if len(combined) > CHUNK_CHARS * 4:
        if on_progress:
            on_progress(92, "Сжимаю черновик пересказа")
        combined = summarize(combined, duration_sec=duration_sec)

    if on_progress:
        on_progress(95, "Собираю итоговый пересказ")
    final_prompt = (
        f"Ниже черновики пересказа частей одного видео (~{mins} мин). "
        f"Собери из них один цельный связный пересказ на русском: "
        f"{plan.words_min}–{plan.words_max} слов, несколько абзацев по смыслу. "
        f"{_STYLE}\n\n{combined}"
    )
    return ollama_generate(final_prompt)
