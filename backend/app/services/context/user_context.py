from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.services.context.context_models import ContextScope, ContextSnippet, UserContext
from app.services.context.orchestrator import build_context


def build_user_context(
    db: Session,
    user_id: uuid.UUID,
    query: str,
    *,
    scope: ContextScope = "all",
    limit: int | None = None,
    primary_entry_id: uuid.UUID | None = None,
) -> UserContext:
    return build_context(
        db,
        user_id,
        query,
        scope=scope,
        limit=limit,
        primary_entry_id=primary_entry_id,
    )


def format_context_for_prompt(context: UserContext, *, max_chars: int | None = None) -> str:
    from app.core.config import settings

    if not context.snippets:
        return "Контекст пользователя пуст."

    char_limit = max_chars if max_chars is not None else settings.context_max_chars
    lines = ["Контекст пользователя:"]
    used = 0
    for index, snippet in enumerate(context.snippets, start=1):
        header = f"[{index}] ({snippet.source}) {snippet.title}"
        if snippet.entry_date:
            header += f"\nДата записи: {snippet.entry_date}"
        block = f"{header}\n{snippet.text.strip()}"
        if used + len(block) > char_limit:
            break
        lines.append(block)
        used += len(block)
    return "\n\n".join(lines)


__all__ = [
    "ContextScope",
    "ContextSnippet",
    "UserContext",
    "build_user_context",
    "format_context_for_prompt",
]
