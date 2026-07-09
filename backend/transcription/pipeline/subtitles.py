"""Получение текста видео с YouTube через субтитры (без распознавания речи).

Используем yt-dlp как библиотеку. Сначала пробуем ручные субтитры,
затем автоматические. Если их нет — возвращаем None, и тогда сработает Whisper.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from yt_dlp import YoutubeDL

from transcription.config import settings


def _pick_subtitle_url(info: dict, lang: str) -> str | None:
    """Ищет ссылку на субтитры в формате json3 для нужного языка."""
    for source_key in ("subtitles", "automatic_captions"):
        tracks = info.get(source_key) or {}
        # точное совпадение языка, затем язык с префиксом (ru-RU), затем английский, затем любой
        candidates = (
            [lang]
            + [code for code in tracks if code.startswith(lang)]
            + ["en"]
            + [code for code in tracks if code.startswith("en")]
            + list(tracks.keys())
        )
        seen: set[str] = set()
        for code in candidates:
            if code in seen or code not in tracks:
                continue
            seen.add(code)
            for fmt in tracks[code]:
                if fmt.get("ext") == "json3":
                    return fmt.get("url")
    return None


def _json3_to_text(raw: str) -> str:
    data = json.loads(raw)
    lines: list[str] = []
    for event in data.get("events", []):
        segs = event.get("segs")
        if not segs:
            continue
        text = "".join(seg.get("utf8", "") for seg in segs)
        text = text.strip()
        if text:
            lines.append(text)
    joined = " ".join(lines)
    return re.sub(r"\s+", " ", joined).strip()


def get_video_info(url: str) -> dict:
    """Достаёт метаданные видео (без скачивания)."""
    opts = {"quiet": True, "skip_download": True, "no_warnings": True}
    with YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


def fetch_subtitles(url: str, info: dict | None = None, lang: str | None = None) -> str | None:
    """Возвращает текст субтитров или None, если субтитров нет."""
    import httpx

    lang = lang or settings.default_language
    if info is None:
        info = get_video_info(url)

    sub_url = _pick_subtitle_url(info, lang)
    if not sub_url:
        return None

    resp = httpx.get(sub_url, timeout=60)
    resp.raise_for_status()
    text = _json3_to_text(resp.text)
    return text or None


def download_audio(url: str, out_dir: Path | None = None) -> Path:
    """Скачивает только аудио для последующего распознавания Whisper."""
    out_dir = out_dir or settings.tmp_path
    outtmpl = str(out_dir / "%(id)s.%(ext)s")
    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "128"}
        ],
    }
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    return out_dir / f"{info['id']}.mp3"
