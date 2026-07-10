from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.models.entry import Entry  # noqa: E402
from app.models.user import User  # noqa: E402

DEFAULT_EMAIL = "petr@petr.local"
KANBAN_BOARD_CONFIG_COLLECTION = "kanban_board_config"
CODE_BOARD_ID = "kanban_code"

PETR_CODE_BOARD_COLUMNS = [
    {
        "id": "future",
        "label": "На будущее",
        "emptyHint": "Идеи и задачи, которые пока отложены",
        "accent": "border-t-orange-400",
        "dotColor": "bg-orange-400",
    },
    {
        "id": "inbox",
        "label": "Неразобранное",
        "emptyHint": "Новые идеи, баги и задачи по коду",
    },
    {
        "id": "analysis",
        "label": "На анализе",
        "emptyHint": "То, что нужно осмыслить и разобрать",
    },
    {
        "id": "in_progress",
        "label": "В разработке",
        "emptyHint": "То, что пишешь в коде прямо сейчас",
    },
    {
        "id": "done",
        "label": "Готово",
        "emptyHint": "Реализовано и принято",
    },
]


def find_board_config(db, user_id: uuid.UUID) -> Entry | None:
    entries = db.scalars(
        select(Entry).where(Entry.user_id == user_id, Entry.type == "note")
    ).all()
    for entry in entries:
        metadata = entry.metadata_ or {}
        if metadata.get("collection") != KANBAN_BOARD_CONFIG_COLLECTION:
            continue
        if metadata.get("board_id") == CODE_BOARD_ID:
            return entry
    return None


def seed_petr_code_board(*, email: str, dry_run: bool = False) -> dict[str, str]:
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            raise RuntimeError(f"Пользователь не найден: {email}")

        metadata = {
            "collection": KANBAN_BOARD_CONFIG_COLLECTION,
            "board_id": CODE_BOARD_ID,
            "board_mode": "code",
            "label": "Код",
            "subtitle": "Разработка и технические задачи",
            "empty_message": "Доска пуста. Добавь первую карточку.",
            "is_builtin": True,
            "columns": PETR_CODE_BOARD_COLUMNS,
        }

        existing = find_board_config(db, user.id)
        if dry_run:
            action = "update" if existing else "create"
            return {"action": action, "board_id": CODE_BOARD_ID, "email": email}

        if existing is None:
            entry = Entry(
                user_id=user.id,
                type="note",
                title="Код",
                content="Разработка и технические задачи",
                metadata_=metadata,
            )
            db.add(entry)
            db.commit()
            return {"action": "created", "entry_id": str(entry.id), "board_id": CODE_BOARD_ID}

        existing.metadata_ = metadata
        existing.title = "Код"
        existing.content = "Разработка и технические задачи"
        db.add(existing)
        db.commit()
        return {"action": "updated", "entry_id": str(existing.id), "board_id": CODE_BOARD_ID}
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed kanban board config for petr's code board.")
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    result = seed_petr_code_board(email=args.email, dry_run=args.dry_run)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
