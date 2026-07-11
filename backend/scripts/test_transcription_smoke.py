"""Smoke test for transcription service mounted at /transcription."""

from __future__ import annotations

import sys
from pathlib import Path

import httpx

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

BASE = "http://127.0.0.1:8000"
PREFIX = "/transcription"
TEST_EMAIL = "smoke_transcription@test.local"
TEST_PASSWORD = "secret12345"


def url(path: str) -> str:
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{PREFIX}{path}"


def check(name: str, ok: bool, detail: str = "") -> None:
    status = "OK" if ok else "FAIL"
    line = f"[{status}] {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    if not ok:
        raise SystemExit(1)


def test_config() -> None:
    from transcription.config import settings

    check("config token loaded", bool(settings.llm_api_key), settings.llm_provider)
    check("config provider", settings.llm_provider == "github", settings.llm_provider)
    check("config model", bool(settings.llm_model), settings.llm_model)
    check("config data dir", settings.data_path.exists(), str(settings.data_path))


def test_llm_generate() -> None:
    from transcription.pipeline.ollama_client import current_model_name, ollama_generate

    out = ollama_generate("Ответь одним словом: готово")
    check("llm generate", len(out.strip()) > 0, f"model={current_model_name()}, preview={out[:80]!r}")


def test_llm_chat() -> None:
    from transcription.pipeline.ollama_client import ollama_chat

    out = ollama_chat(
        [
            {"role": "system", "content": "Отвечай кратко по-русски."},
            {"role": "user", "content": "Скажи одно слово: чат"},
        ]
    )
    check("llm chat", len(out.strip()) > 0, out[:80])


def test_llm_stream() -> None:
    from transcription.pipeline.ollama_client import ollama_chat_stream

    chunks = list(
        ollama_chat_stream(
            [{"role": "user", "content": "Скажи одно слово: поток"}],
        )
    )
    joined = "".join(chunks).strip()
    check("llm stream", len(joined) > 0, joined[:80])


def test_summarize() -> None:
    from transcription.pipeline.summarize import summarize

    text = (
        "Сегодня поговорим про уход за волосами. Первое правило — подбирать шампунь "
        "под тип кожи головы. Второе — не мыть голову слишком горячей водой. "
        "Третье — использовать кондиционер по длине, избегая корней."
    )
    out = summarize(text, duration_sec=180)
    check("summarize pipeline", len(out.strip()) > 80, f"len={len(out)}, preview={out[:120]!r}")


def test_web_auth_and_pages() -> None:
    with httpx.Client(base_url=BASE, follow_redirects=False, timeout=30) as client:
        login_page = client.get(url("/login"))
        check("GET /login", login_page.status_code == 200, str(login_page.status_code))

        static_css = client.get(url("/static/chat.css"))
        check("GET /static/chat.css", static_css.status_code == 200, str(static_css.status_code))

        register = client.post(
            url("/register"),
            data={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        )
        if register.status_code == 302:
            check("POST /register", True, "new user")
        else:
            login = client.post(
                url("/login"),
                data={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            )
            check("POST /login", login.status_code == 302, str(login.status_code))

        home = client.get(url("/"), follow_redirects=True)
        check("GET / (authenticated)", home.status_code == 200, "has form=" + str("url-form" in home.text))
        check("home has chat.js", "chat.js" in home.text)
        check("home root-path meta", 'name="root-path"' in home.text or "root-path" in home.text)


def test_create_chat_queued() -> None:
    with httpx.Client(base_url=BASE, follow_redirects=False, timeout=30) as client:
        client.post(url("/login"), data={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        # Short test URL - won't wait for full processing
        create = client.post(
            url("/chats"),
            data={"url": "https://www.youtube.com/watch?v=jNQXAC9IVRw"},
            headers={"HX-Request": "true"},
        )
        check("POST /chats", create.status_code == 200, str(create.status_code))
        check("chat panel html", "chat-main" in create.text or "chat-boot" in create.text, "panel rendered")


def main() -> None:
    print("Transcription smoke test")
    print("=" * 40)
    test_config()
    test_llm_generate()
    test_llm_chat()
    test_llm_stream()
    test_summarize()
    test_web_auth_and_pages()
    test_create_chat_queued()
    print("=" * 40)
    print("All checks passed.")


if __name__ == "__main__":
    main()
