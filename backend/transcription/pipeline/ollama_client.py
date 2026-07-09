"""Клиент для пересказа и чата: OpenAI или GitHub Models (PAT)."""

from __future__ import annotations

import json
import threading
import time
from collections.abc import Iterator

import httpx

from transcription.config import settings

_last_request_at = 0.0
_throttle_lock = threading.Lock()


def _is_github_token(token: str) -> bool:
    return token.startswith(("github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_"))


def _headers() -> dict[str, str]:
    if not settings.llm_api_key:
        raise RuntimeError("Не задан токен для транскрибации (токен.txt или OPENAI_API_KEY).")
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    if settings.llm_provider == "github":
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    return headers


def _chat_url() -> str:
    return f"{settings.llm_base_url.rstrip('/')}/chat/completions"


def _extract_content(payload: dict) -> str:
    try:
        return str(payload["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("Модель вернула неожиданный ответ.") from exc


def _parse_retry_after(response: httpx.Response) -> float | None:
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    try:
        return max(1.0, float(raw))
    except ValueError:
        return None


def _rate_limit_error() -> RuntimeError:
    if settings.llm_provider == "github":
        return RuntimeError(
            "Превышен лимит запросов GitHub Models (429). "
            "Подожди 1–2 минуты и нажми «Попробовать снова», "
            "или укажи OPENAI_API_KEY в backend/.env."
        )
    return RuntimeError("Превышен лимит запросов к модели (429). Подожди и попробуй снова.")


def _throttle() -> None:
    pause = settings.llm_request_pause_sec
    if pause <= 0:
        return
    global _last_request_at
    with _throttle_lock:
        now = time.monotonic()
        wait = pause - (now - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()


def _retry_delay(attempt: int, response: httpx.Response | None = None) -> float:
    if response is not None:
        retry_after = _parse_retry_after(response)
        if retry_after is not None:
            return retry_after
    return settings.llm_retry_base_delay * (2**attempt)


def _should_retry_status(status_code: int) -> bool:
    return status_code in {429, 502, 503, 504}


def _chat_complete(messages: list[dict[str, str]], timeout: int = 600) -> str:
    last_error: Exception | None = None

    for attempt in range(settings.llm_retry_max):
        _throttle()
        try:
            resp = httpx.post(
                _chat_url(),
                headers=_headers(),
                json={
                    "model": settings.llm_model,
                    "messages": messages,
                    "temperature": 0.4,
                },
                timeout=timeout,
            )
            if _should_retry_status(resp.status_code):
                if attempt < settings.llm_retry_max - 1:
                    time.sleep(_retry_delay(attempt, resp))
                    continue
                if resp.status_code == 429:
                    raise _rate_limit_error()
                resp.raise_for_status()
            resp.raise_for_status()
            return _extract_content(resp.json())
        except httpx.HTTPStatusError as exc:
            last_error = exc
            if _should_retry_status(exc.response.status_code) and attempt < settings.llm_retry_max - 1:
                time.sleep(_retry_delay(attempt, exc.response))
                continue
            if exc.response.status_code == 429:
                raise _rate_limit_error() from exc
            raise RuntimeError(f"Ошибка модели ({exc.response.status_code}): {exc}") from exc
        except httpx.RequestError as exc:
            last_error = exc
            if attempt < settings.llm_retry_max - 1:
                time.sleep(_retry_delay(attempt))
                continue
            raise RuntimeError(f"Не удалось связаться с моделью: {exc}") from exc

    raise RuntimeError(f"Не удалось получить ответ модели: {last_error}")


def ollama_generate(prompt: str, timeout: int = 600) -> str:
    return _chat_complete([{"role": "user", "content": prompt}], timeout=timeout)


def ollama_chat(messages: list[dict[str, str]], timeout: int = 600) -> str:
    return _chat_complete(messages, timeout=timeout)


def ollama_chat_stream(messages: list[dict[str, str]], timeout: int = 600) -> Iterator[str]:
    last_error: Exception | None = None

    for attempt in range(settings.llm_retry_max):
        _throttle()
        try:
            with httpx.stream(
                "POST",
                _chat_url(),
                headers=_headers(),
                json={
                    "model": settings.llm_model,
                    "messages": messages,
                    "temperature": 0.4,
                    "stream": True,
                },
                timeout=timeout,
            ) as resp:
                if _should_retry_status(resp.status_code):
                    if attempt < settings.llm_retry_max - 1:
                        time.sleep(_retry_delay(attempt, resp))
                        continue
                    if resp.status_code == 429:
                        raise _rate_limit_error()
                    resp.raise_for_status()
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    payload = line[6:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        data = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    delta = (data.get("choices") or [{}])[0].get("delta", {}).get("content") or ""
                    if delta:
                        yield delta
                return
        except httpx.HTTPStatusError as exc:
            last_error = exc
            if _should_retry_status(exc.response.status_code) and attempt < settings.llm_retry_max - 1:
                time.sleep(_retry_delay(attempt, exc.response))
                continue
            if exc.response.status_code == 429:
                raise _rate_limit_error() from exc
            raise RuntimeError(f"Ошибка модели ({exc.response.status_code}): {exc}") from exc
        except httpx.RequestError as exc:
            last_error = exc
            if attempt < settings.llm_retry_max - 1:
                time.sleep(_retry_delay(attempt))
                continue
            raise RuntimeError(f"Не удалось связаться с моделью: {exc}") from exc

    raise RuntimeError(f"Не удалось получить ответ модели: {last_error}")


def current_model_name() -> str:
    return settings.llm_model


def chunk_chars() -> int:
    """Крупнее куски для GitHub Models — меньше запросов, ниже риск 429."""
    if settings.llm_provider == "github":
        return 6000
    return 3000
