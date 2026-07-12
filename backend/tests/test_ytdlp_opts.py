from __future__ import annotations

from transcription.pipeline import ytdlp_opts


def test_cookies_browsers_auto_windows(monkeypatch) -> None:
    monkeypatch.setattr(ytdlp_opts.platform, "system", lambda: "Windows")
    monkeypatch.setattr(
        "transcription.pipeline.ytdlp_opts.settings",
        type(
            "S",
            (),
            {
                "ytdlp_cookies_from_browser": "auto",
                "ytdlp_cookies_file": "",
            },
        )(),
    )

    class AppSettings:
        environment = "local"

    monkeypatch.setattr("app.core.config.settings", AppSettings())
    assert ytdlp_opts._cookies_browsers_to_try() == ["edge", "firefox", "chrome"]


def test_cookies_browsers_explicit_none(monkeypatch) -> None:
    monkeypatch.setattr(
        "transcription.pipeline.ytdlp_opts.settings",
        type(
            "S",
            (),
            {
                "ytdlp_cookies_from_browser": "none",
                "ytdlp_cookies_file": "",
            },
        )(),
    )
    assert ytdlp_opts._cookies_browsers_to_try() == []


def test_is_youtube_bot_block() -> None:
    assert ytdlp_opts.is_youtube_bot_block(Exception("Sign in to confirm you're not a bot"))
    assert not ytdlp_opts.is_youtube_bot_block(Exception("404 Not Found"))


def test_is_cookie_database_error() -> None:
    assert ytdlp_opts.is_cookie_database_error(Exception("Could not copy Chrome cookie database"))
    assert not ytdlp_opts.is_cookie_database_error(Exception("404 Not Found"))


def test_iter_ytdlp_attempt_opts_includes_browser_cookies(monkeypatch) -> None:
    monkeypatch.setattr(ytdlp_opts, "_cookies_browsers_to_try", lambda: ["edge"])
    attempts = list(ytdlp_opts.iter_ytdlp_attempt_opts({"skip_download": True}))
    assert len(attempts) == 2
    assert "cookiesfrombrowser" not in attempts[0]
    assert attempts[1]["cookiesfrombrowser"] == ("edge",)
