from __future__ import annotations

import argparse
import re
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.models.entry import Entry  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.entry import EntryType  # noqa: E402
from app.schemas.metadata import normalize_metadata  # noqa: E402

DEFAULT_SOURCE = Path.home() / "Downloads" / "жизнь_ванечки.txt"
DEFAULT_EMAIL = "petr@petr.local"
LIFE_NOTES_COLLECTION = "life_notes"
DEFAULT_CATEGORY = "Жизнь Ванечки"

BLOCK_PATTERN = re.compile(
    r"={40,}\s*\n(\d{2})\.(\d{2})\.(\d{4})\s*\n={40,}\s*\n(.*?)(?=\s*={40,}\s*\n|\Z)",
    re.DOTALL,
)


def parse_life_notes_file(path: Path) -> list[dict[str, str]]:
    text = path.read_text(encoding="utf-8")
    parsed: list[dict[str, str]] = []

    for match in BLOCK_PATTERN.finditer(text):
        day, month, year = match.groups()[:3]
        body = match.group(4).strip()
        if not body:
            continue

        entry_date = f"{year}-{month}-{day}"
        parsed.append(
            {
                "entry_date": entry_date,
                "title": f"{day}.{month}.{year[2:]}",
                "content": body,
            }
        )

    parsed.sort(key=lambda item: item["entry_date"])
    return parsed


def existing_life_note_dates(db, user_id: uuid.UUID) -> set[str]:
    entries = db.scalars(
        select(Entry).where(Entry.user_id == user_id, Entry.type == "diary")
    ).all()
    dates: set[str] = set()
    for entry in entries:
        if entry.metadata_.get("collection") != LIFE_NOTES_COLLECTION:
            continue
        entry_date = entry.metadata_.get("entry_date")
        if isinstance(entry_date, str) and entry_date:
            dates.add(entry_date)
    return dates


def import_life_notes(
    *,
    source_path: Path,
    email: str,
    dry_run: bool = False,
) -> dict[str, int]:
    notes = parse_life_notes_file(source_path)
    if not notes:
        raise RuntimeError(f"Не удалось найти записи в файле: {source_path}")

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            raise RuntimeError(f"Пользователь не найден: {email}")

        existing_dates = existing_life_note_dates(db, user.id)
        created = 0
        skipped = 0

        for note in notes:
            if note["entry_date"] in existing_dates:
                skipped += 1
                continue

            metadata = normalize_metadata(
                EntryType.diary,
                {
                    "mode": "diary",
                    "entry_date": note["entry_date"],
                    "collection": LIFE_NOTES_COLLECTION,
                    "category": DEFAULT_CATEGORY,
                    "source": "import_life_notes",
                },
            )

            if dry_run:
                created += 1
                continue

            entry = Entry(
                user_id=user.id,
                type="diary",
                title=note["title"],
                content=note["content"],
                metadata_=metadata,
            )
            db.add(entry)
            created += 1

            if created % 200 == 0:
                db.commit()

        if not dry_run:
            db.commit()

        return {
            "parsed": len(notes),
            "created": created,
            "skipped": skipped,
        }
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Импорт дневника в раздел «Заметки».")
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="Путь к файлу жизнь_ванечки.txt",
    )
    parser.add_argument(
        "--email",
        default=DEFAULT_EMAIL,
        help="Email пользователя, для которого импортируются записи",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Только посчитать записи без записи в БД",
    )
    args = parser.parse_args()

    if not args.source.exists():
        print(f"Файл не найден: {args.source}", file=sys.stderr)
        return 1

    result = import_life_notes(
        source_path=args.source,
        email=args.email,
        dry_run=args.dry_run,
    )

    mode = "dry-run" if args.dry_run else "import"
    print(
        f"[{mode}] parsed={result['parsed']} created={result['created']} skipped={result['skipped']} "
        f"user={args.email}"
    )

    if result["parsed"] > 0:
        preview = parse_life_notes_file(args.source)
        print(f"first={preview[0]['entry_date']} last={preview[-1]['entry_date']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
