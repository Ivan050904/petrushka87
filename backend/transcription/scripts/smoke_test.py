"""Проверка основных кусков без браузера."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

BASE = "http://127.0.0.1:8000"


def test_web_flow():
    c = httpx.Client(base_url=BASE, follow_redirects=False, timeout=30)
    # register (уже может существовать -> тогда пробуем login)
    r = c.post("/register", data={"email": "smoke@test.ru", "password": "secret123"})
    if r.status_code == 302:
        print("register: ok (302)")
    else:
        r = c.post("/login", data={"email": "smoke@test.ru", "password": "secret123"})
        print("login:", r.status_code)
    # home должна быть доступна
    r = c.get("/", follow_redirects=True)
    print("home:", r.status_code, "has form:", "url-form" in r.text)
    return c


def test_summarize():
    from transcription.pipeline.summarize import summarize

    text = (
        "Сегодня поговорим про уход за волосами. Первое правило — подбирать шампунь "
        "под тип кожи головы. Второе — не мыть голову слишком горячей водой. "
        "Третье — использовать кондиционер по длине, избегая корней. "
        "Четвёртое — раз в неделю делать питательную маску."
    )
    out = summarize(text)
    print("summarize len:", len(out))
    print("summary preview:", out[:200])


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "web"):
        test_web_flow()
    if what in ("all", "sum"):
        test_summarize()
