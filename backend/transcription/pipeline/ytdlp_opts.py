from __future__ import annotations

import platform
from pathlib import Path
from typing import Any, Iterator

from yt_dlp.utils import DownloadError

from transcription.config import settings

DEFAULT_YOUTUBE_COOKIES_FILE = settings.data_path.parent / "youtube-cookies.txt"


def _base_ytdlp_opts(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "extractor_args": {
            "youtube": {
                "player_client": ["tv", "android_vr", "web"],
            }
        },
    }
    if extra:
        opts.update(extra)
    return opts


def _cookies_browsers_to_try() -> list[str]:
    configured = settings.ytdlp_cookies_from_browser.strip().lower()
    if configured in {"", "none", "off", "false", "0"}:
        return []
    if configured not in {"", "auto"}:
        return [configured]

    from app.core.config import settings as app_settings

    if app_settings.environment != "local":
        return []
    if platform.system() == "Windows":
        # Chrome last: its cookie DB is locked while the browser is open.
        return ["edge", "firefox", "chrome"]
    if platform.system() == "Darwin":
        return ["chrome", "safari"]
    return ["firefox", "chrome"]


def _configured_cookies_files() -> list[str]:
    files: list[str] = []
    configured = settings.ytdlp_cookies_file.strip()
    if configured:
        files.append(configured)
    default_file = DEFAULT_YOUTUBE_COOKIES_FILE
    default_path = str(default_file)
    if default_path not in files and default_file.is_file():
        files.append(default_path)
    return files


def iter_ytdlp_attempt_opts(extra: dict[str, Any] | None = None) -> Iterator[dict[str, Any]]:
    """Yield yt-dlp option sets: plain, cookies file, then browser cookies."""
    yield _base_ytdlp_opts(extra)

    for cookies_file in _configured_cookies_files():
        yield _base_ytdlp_opts({**(extra or {}), "cookiefile": cookies_file})

    for browser in _cookies_browsers_to_try():
        yield _base_ytdlp_opts({**(extra or {}), "cookiesfrombrowser": (browser,)})


def is_youtube_bot_block(exc: Exception) -> bool:
    message = str(exc).lower()
    return "sign in to confirm" in message or "not a bot" in message


def is_cookie_database_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "cookie" in message and (
        "could not copy" in message
        or "permission denied" in message
        or "being used by another process" in message
    )


def run_ytdlp(url: str, *, download: bool, **extra: Any) -> dict:
    last_error: Exception | None = None
    opts_extra = {"skip_download": not download, **extra}
    attempts = list(iter_ytdlp_attempt_opts(opts_extra))

    for index, opts in enumerate(attempts):
        try:
            from yt_dlp import YoutubeDL

            with YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=download)
        except DownloadError as exc:
            last_error = exc
        except Exception as exc:
            last_error = exc

        is_last = index == len(attempts) - 1
        if is_last:
            break
        if is_youtube_bot_block(last_error) or is_cookie_database_error(last_error):
            continue
        used_cookies = bool(opts.get("cookiesfrombrowser") or opts.get("cookiefile"))
        if used_cookies:
            continue
        break

    if last_error is not None:
        raise last_error
    raise RuntimeError("Не удалось обратиться к YouTube.")
