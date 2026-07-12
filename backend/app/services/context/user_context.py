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


def _snippet_year(snippet: ContextSnippet) -> str | None:
    if snippet.entry_date and len(snippet.entry_date) >= 4:
        return snippet.entry_date[:4]
    return None


def _entity_index_line(index: int, snippet: ContextSnippet) -> str:
    date_label = snippet.entry_date or "без даты"
    return f"{index}. {date_label} — {snippet.title} ({snippet.source})"


def _snippets_for_prompt(context: UserContext) -> list[ContextSnippet]:
    from app.core.config import settings

    snippets = list(context.snippets)
    if context.retrieval_mode != "entity_timeline":
        return snippets

    normalized = context.query.lower().replace("ё", "е")
    if any(token in normalized for token in ("последн", "recent", "latest")):
        snippets.reverse()

    prompt_limit = settings.context_entity_prompt_limit
    if len(snippets) > prompt_limit:
        snippets = snippets[:prompt_limit]
    return snippets


def format_context_for_prompt(context: UserContext, *, max_chars: int | None = None) -> str:
    from app.core.config import settings

    lines: list[str] = []
    if context.catalog_summary:
        lines.append(f"Карта данных: {context.catalog_summary}")

    snippets = _snippets_for_prompt(context)
    if not snippets:
        lines.append("Контекст пользователя пуст.")
        return "\n\n".join(lines)

    if context.retrieval_mode == "entity_timeline":
        char_limit = max_chars if max_chars is not None else settings.context_entity_max_chars
        terms = ", ".join(context.entity_terms) if context.entity_terms else "сущность"
        header = f"Хронология упоминаний ({terms}):"
        if context.entity_match_total is not None:
            header += f" найдено {context.entity_match_total} записей."
            if len(snippets) < context.entity_match_total:
                header += f" В контекст передано {len(snippets)} самых релевантных."
        if context.entity_year_counts:
            parts = [f"{year} ({count})" for year, count in sorted(context.entity_year_counts.items())]
            header += f" По годам: {', '.join(parts)}."
        lines.append(header)

        used = sum(len(line) for line in lines)
        index_lines: list[str] = []
        for index, snippet in enumerate(snippets, start=1):
            line = _entity_index_line(index, snippet)
            if used + len(line) + 80 > char_limit:
                break
            index_lines.append(line)
            used += len(line)
        if index_lines:
            lines.append("Указатель записей:")
            lines.extend(index_lines)
            if len(index_lines) < len(snippets):
                lines.append(f"(В указателе {len(index_lines)} из {len(snippets)} записей.)")
            lines.append("Выдержки из записей:")
            used = sum(len(line) for line in lines)
    else:
        char_limit = max_chars if max_chars is not None else settings.context_max_chars
        lines.append("Контекст пользователя:")
        used = sum(len(line) for line in lines)
    current_year: str | None = None
    index = 0

    for snippet in snippets:
        index += 1
        year = _snippet_year(snippet)
        if context.retrieval_mode == "entity_timeline" and year and year != current_year:
            year_line = f"--- {year} ---"
            if used + len(year_line) > char_limit:
                break
            lines.append(year_line)
            used += len(year_line)
            current_year = year

        header = f"[{index}] ({snippet.source}) {snippet.title}"
        if snippet.entry_date:
            header += f"\nДата записи: {snippet.entry_date}"
        block = f"{header}\n{snippet.text.strip()}"
        if used + len(block) > char_limit:
            if context.retrieval_mode == "entity_timeline" and context.entity_match_total:
                remaining = context.entity_match_total - index + 1
                if remaining > 0:
                    lines.append(f"(Показано {index - 1} из {context.entity_match_total} записей.)")
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
