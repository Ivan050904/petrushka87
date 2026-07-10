from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.models.entry import Entry  # noqa: E402
from app.models.user import User  # noqa: E402
from scripts.import_life_notes import (  # noqa: E402
    DEFAULT_EMAIL,
    parse_life_notes_dir,
    validate_weekday_consistency,
)

DEFAULT_SOURCE_DIR = Path(
    r"C:\Users\Perfercher\Documents\выгрузка\все_заметки_txt"
)


def audit_weekdays(
    items: list[dict[str, str]],
    *,
    label: str,
    limit: int = 30,
) -> int:
    print(f"\n=== WEEKDAY CHECK ({label}) ===")
    with_weekday = 0
    matching = 0
    mismatches: list[dict[str, str]] = []

    for item in items:
        result = validate_weekday_consistency(item["entry_date"], item["content"])
        if not result["has_weekday"]:
            continue
        with_weekday += 1
        if result["matches"]:
            matching += 1
            continue
        mismatches.append(
            {
                "source_file": item["source_file"],
                "entry_date": item["entry_date"],
                "date_weekday": str(result["date_weekday"]),
                "text_weekday": str(result["text_weekday"]),
            }
        )

    print(f"total_with_weekday={with_weekday} matching={matching} mismatching={len(mismatches)}")
    for row in mismatches[:limit]:
        print(
            f"  {row['source_file']} | {row['entry_date']} ({row['date_weekday']}) "
            f"| text says {row['text_weekday']}"
        )
    if len(mismatches) > limit:
        print(f"  ... and {len(mismatches) - limit} more")

    return len(mismatches)


def audit_source_dir(source_dir: Path) -> int:
    notes, stats = parse_life_notes_dir(source_dir)
    print("=== SOURCE AUDIT ===")
    print(f"parsed={len(notes)} year_corrected={stats.get('year_corrected', 0)}")

    corrections: list[tuple[str, int, int, str]] = []
    for note in notes:
        resolved_year = int(note["entry_date"].split("-")[0])
        if note["filename_year"] != resolved_year:
            corrections.append(
                (
                    note["source_file"],
                    note["filename_year"],
                    resolved_year,
                    note["year_source"],
                )
            )

    print(f"corrections={len(corrections)}")
    for source_file, old_year, new_year, source in corrections[:30]:
        print(f"  {source_file}: {old_year} -> {new_year} ({source})")
    if len(corrections) > 30:
        print(f"  ... and {len(corrections) - 30} more")

    source_items = [
        {
            "source_file": note["source_file"],
            "entry_date": note["entry_date"],
            "content": note["content"],
        }
        for note in notes
    ]
    return audit_weekdays(source_items, label="source")


def audit_database(email: str) -> int:
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            raise RuntimeError(f"Пользователь не найден: {email}")

        entries = [
            entry
            for entry in db.scalars(
                select(Entry).where(Entry.user_id == user.id, Entry.type == "diary")
            ).all()
            if entry.metadata_.get("collection") == "life_notes"
        ]
        print("\n=== DATABASE AUDIT ===")
        print(f"total={len(entries)}")

        corrected = [
            entry
            for entry in entries
            if entry.metadata_.get("filename_year") is not None
        ]
        print(f"year_corrected_in_db={len(corrected)}")

        print("\n=== JULY 17 (database) ===")
        for entry in sorted(
            [
                item
                for item in entries
                if item.metadata_.get("entry_date", "").endswith("-07-17")
            ],
            key=lambda item: item.metadata_.get("entry_date", ""),
        ):
            meta = entry.metadata_
            print(
                f"  {meta.get('entry_date')} | {entry.title} | {meta.get('source_file')} "
                f"(file_year={meta.get('filename_year', '-')}, src={meta.get('year_source', '-')})"
            )

        db_items = [
            {
                "source_file": str(entry.metadata_.get("source_file", entry.id)),
                "entry_date": str(entry.metadata_.get("entry_date", "")),
                "content": entry.content,
            }
            for entry in entries
        ]
        return audit_weekdays(db_items, label="database")
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Проверка импорта life_notes.")
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help="Папка с txt-заметками",
    )
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--db-only", action="store_true")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Вернуть код 1, если есть несовпадения дня недели",
    )
    args = parser.parse_args()

    mismatch_total = 0
    if not args.db_only:
        if not args.source_dir.is_dir():
            print(f"Папка не найдена: {args.source_dir}", file=sys.stderr)
            return 1
        mismatch_total += audit_source_dir(args.source_dir)

    mismatch_total += audit_database(args.email)

    if args.strict and mismatch_total > 0:
        print(f"\nSTRICT: found {mismatch_total} weekday mismatches")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
