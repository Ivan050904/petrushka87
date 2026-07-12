from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select, text

from app.db.session import SessionLocal
from app.models.user import User
from app.services.context.entity_query import resolve_entity_terms
from app.services.context.entity_search import search_entity_mentions
from app.services.context.orchestrator import build_context
from app.services.context.user_context import format_context_for_prompt


def main() -> None:
    entity = sys.argv[1] if len(sys.argv) > 1 else "Маню"
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == "demo@folio-one.local"))
        if user is None:
            raise SystemExit("demo user not found")

        terms = resolve_entity_terms(db, user.id, entity)
        print("terms:", terms[:12])

        hits = search_entity_mentions(db, user.id, terms, limit=200)
        print("FTS hits:", len(hits))
        by_year: dict[str, int] = {}
        for hit in hits:
            year = (hit.entry_date or "?")[:4]
            by_year[year] = by_year.get(year, 0) + 1
        print("by_year:", dict(sorted(by_year.items())))

        like_count = db.scalar(
            text(
                "SELECT count(*) FROM entries WHERE user_id=:uid "
                "AND (lower(content) LIKE '%ман%' OR lower(title) LIKE '%ман%')"
            ),
            {"uid": str(user.id)},
        )
        print("LIKE %ман% entries:", like_count)

        ctx = build_context(db, user.id, f"найди упоминания про {entity}")
        print("snippets:", len(ctx.snippets), "entity_match_total:", ctx.entity_match_total)
        prompt = format_context_for_prompt(ctx)
        print("prompt chars:", len(prompt))
        indices = [int(x) for x in re.findall(r"\[(\d+)\]", prompt)]
        print("shown in prompt:", max(indices) if indices else 0)
        for year in ("2024", "2025", "2026"):
            print(f"has {year} in prompt:", "yes" if year in prompt else "NO")
    finally:
        db.close()


if __name__ == "__main__":
    main()
