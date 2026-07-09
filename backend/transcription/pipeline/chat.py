"""Ответы на вопросы по содержанию видео через Ollama chat."""

from __future__ import annotations

from collections.abc import Iterator

from transcription.models import ChatMessage, Job
from transcription.pipeline.ollama_client import ollama_chat, ollama_chat_stream
from transcription.pipeline.retrieval import build_transcript_context

HISTORY_LIMIT = 20
CONTEXT_CHAR_LIMIT = 16000

_SYSTEM = (
    "Ты помощник по содержанию одного конкретного видео. "
    "Отвечай только на основе предоставленного пересказа, позиций спикеров и релевантных фрагментов транскрипта. "
    "Если в материалах нет ответа — честно скажи, что в видео этого не было. "
    "Отвечай на русском языке, кратко и по делу."
)


def _build_context(job: Job, question: str) -> str:
    parts = [
        f"Название: {job.title or 'без названия'}",
        f"Ссылка: {job.url}",
    ]
    if job.summary:
        parts.append(f"Пересказ:\n{job.summary}")
    if job.opinions:
        parts.append(f"Позиции и мнения спикеров:\n{job.opinions}")

    used = sum(len(p) for p in parts)
    budget = max(2000, CONTEXT_CHAR_LIMIT - used)
    transcript_ctx = build_transcript_context(job.transcript or "", question, budget=budget)
    if transcript_ctx:
        parts.append(f"Релевантные фрагменты транскрипта:\n{transcript_ctx}")

    return "\n\n".join(parts)


def _build_messages(job: Job, history: list[ChatMessage], user_question: str) -> list[dict[str, str]]:
    context = _build_context(job, user_question)
    messages: list[dict[str, str]] = [
        {"role": "system", "content": f"{_SYSTEM}\n\nМатериалы по видео:\n\n{context}"},
    ]

    recent = history[-HISTORY_LIMIT:] if len(history) > HISTORY_LIMIT else history
    for msg in recent:
        messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": user_question})
    return messages


def answer_question(
    job: Job,
    history: list[ChatMessage],
    user_question: str,
) -> str:
    if job.status != "done":
        raise ValueError("Видео ещё не обработано.")

    question = user_question.strip()
    if not question:
        raise ValueError("Пустой вопрос.")

    messages = _build_messages(job, history, question)
    return ollama_chat(messages)


def answer_question_stream(
    job: Job,
    history: list[ChatMessage],
    user_question: str,
) -> Iterator[str]:
    if job.status != "done":
        raise ValueError("Видео ещё не обработано.")

    question = user_question.strip()
    if not question:
        raise ValueError("Пустой вопрос.")

    messages = _build_messages(job, history, question)
    yield from ollama_chat_stream(messages)
