from __future__ import annotations

import re

AI_ALLOWED_SITE = "habr.com"

AI_TOPIC_TERMS: tuple[str, ...] = (
    "ai agent",
    "agent",
    "agents",
    "cursor",
    "claude",
    "codex",
    "copilot",
    "github copilot",
    "llm",
    "mcp",
    "autonomous",
    "ии агент",
    "агент",
    "агенты",
    "cursor ai",
    "openai",
    "anthropic",
)


def is_safe_ai_search_query(query: str) -> bool:
    lowered = query.lower()
    match = re.search(r"(?:^|\s)site:([a-z0-9.-]+)", lowered)
    if not match:
        return False
    host = match.group(1).removeprefix("www.")
    if host != AI_ALLOWED_SITE and not host.endswith(f".{AI_ALLOWED_SITE}"):
        return False
    return any(term in lowered for term in AI_TOPIC_TERMS)
