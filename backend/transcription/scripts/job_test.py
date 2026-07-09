"""Полный тест задачи: отправляем ссылку и ждём результат."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

BASE = "http://127.0.0.1:8000"


def run(url: str):
    c = httpx.Client(base_url=BASE, follow_redirects=False, timeout=60)
    r = c.post("/register", data={"email": "job@test.ru", "password": "secret123"})
    if r.status_code != 302:
        c.post("/login", data={"email": "job@test.ru", "password": "secret123"})

    r = c.post("/jobs", data={"url": url})
    loc = r.headers.get("location", "")
    print("created:", r.status_code, loc)
    job_id = loc.rstrip("/").split("/")[-1]

    for _ in range(200):
        s = c.get(f"/jobs/{job_id}/status").json()
        print(f"  [{s['status']}] {s['stage']} src={s.get('source','')}")
        if s["status"] in ("done", "error"):
            print("TITLE:", s.get("title"))
            print("SOURCE:", s.get("source"))
            if s["status"] == "done":
                print("SUMMARY:\n", s["summary"][:600])
                print("has_transcript:", s["has_transcript"])
            else:
                print("ERROR:", s["error"])
            return
        time.sleep(3)
    print("timeout")


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://www.youtube.com/watch?v=aircAruvnKk"
    run(url)
