"""Извлечение позиций и мнений основных спикеров из транскрипта."""

from __future__ import annotations

from collections.abc import Callable

from transcription.pipeline.ollama_client import chunk_chars, ollama_generate
from transcription.pipeline.summarize import build_retelling_plan
from transcription.pipeline.text_chunks import CHUNK_CHARS, split_text

_STYLE = (
    "Пиши связным текстом абзацами. Для каждого спикера — отдельный подзаголовок с именем или ролью. "
    "Без маркированных списков и нумерации. Укажи позицию, аргументы и с чем спикер не согласен, если это есть в тексте."
)

ProgressCallback = Callable[[int, str], None]


def _extract_chunk(chunk: str, minutes: int) -> str:
    prompt = (
        f"Ниже фрагмент расшифровки видео (~{minutes} мин). "
        f"Выдели позиции и мнения основных спикеров/авторов в этом фрагменте. "
        f"Для каждого: общая позиция, ключевые аргументы, с чем не согласен. "
        f"{_STYLE}\n\n{chunk}"
    )
    return ollama_generate(prompt)


def extract_opinions(
    text: str,
    duration_sec: int | None = None,
    on_progress: ProgressCallback | None = None,
) -> str:
    text = text.strip()
    if not text:
        return "Не удалось выделить позиции: текст пуст."

    plan = build_retelling_plan(duration_sec, text)
    chunks = split_text(text, size=chunk_chars())
    mins = int(plan.minutes)

    if len(chunks) <= 1:
        if on_progress:
            on_progress(92, "Выделяю позиции и мнения")
        prompt = (
            f"По расшифровке видео (~{mins} мин) выдели позиции и мнения основных спикеров/авторов. "
            f"Для каждого: общая позиция, аргументы, с чем не согласен. "
            f"{_STYLE}\n\n{text}"
        )
        return ollama_generate(prompt)

    partials: list[str] = []
    total = len(chunks)
    for i, chunk in enumerate(chunks):
        if on_progress:
            pct = 90 + int((i / total) * 6)
            on_progress(pct, f"Позиции: часть {i + 1} из {total}")
        partials.append(_extract_chunk(chunk, mins))

    combined = "\n\n".join(partials)

    if on_progress:
        on_progress(97, "Собираю итоговые позиции")
    final_prompt = (
        f"Ниже черновики позиций и мнений спикеров из частей одного видео (~{mins} мин). "
        f"Собери единый текст: для каждого основного спикера — позиция, аргументы, с чем не согласен. "
        f"Убери дубли. {_STYLE}\n\n{combined}"
    )
    return ollama_generate(final_prompt)
