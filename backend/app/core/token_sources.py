from __future__ import annotations

from pathlib import Path

_TOKEN_PREFIXES = ("sk-", "github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_")


def is_github_token(token: str) -> bool:
    return token.startswith(("github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_"))


def read_desktop_token() -> str:
    desktop = Path.home() / "Desktop"
    if not desktop.exists():
        return ""

    token_files = sorted(
        (path for path in desktop.glob("*.txt") if path.stat().st_size <= 256),
        key=lambda path: path.stat().st_size,
    )
    for path in token_files:
        content = path.read_text(encoding="utf-8").strip()
        if content.startswith(_TOKEN_PREFIXES):
            return content
    return ""
