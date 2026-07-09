"""YouTube URL helpers for thumbnails and metadata in UI."""

from __future__ import annotations

import re
from datetime import datetime

_YT_RE = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)"
    r"([a-zA-Z0-9_-]{11})"
)


def youtube_video_id(url: str) -> str | None:
    if not url:
        return None
    match = _YT_RE.search(url)
    return match.group(1) if match else None


def youtube_thumbnail(url: str, quality: str = "mqdefault") -> str | None:
    video_id = youtube_video_id(url)
    if not video_id:
        return None
    return f"https://i.ytimg.com/vi/{video_id}/{quality}.jpg"


def fmt_date(dt: datetime | None) -> str:
    if dt is None:
        return ""
    return dt.strftime("%d.%m.%Y")
