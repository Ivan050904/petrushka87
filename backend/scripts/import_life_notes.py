from __future__ import annotations

import argparse
import re
import sys
import uuid
from datetime import date
from pathlib import Path
from typing import Literal, TypedDict

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import delete, select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.models.entry import Entry  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.entry import EntryType  # noqa: E402
from app.schemas.metadata import normalize_metadata  # noqa: E402

DEFAULT_SOURCE = Path.home() / "Downloads" / "жизнь_ванечки.txt"
DEFAULT_EMAIL = "petr@petr.local"
LIFE_NOTES_COLLECTION = "life_notes"
DEFAULT_CATEGORY = "Жизнь Ванечки"

SKIP_DIR_FILES = {
    "пропущенные_дни.txt",
    "восстановленные_из_md.txt",
    "восстановленные_из_md_2.txt",
}

BLOCK_PATTERN = re.compile(
    r"={40,}\s*\n(\d{2})\.(\d{2})\.(\d{4})\s*\n={40,}\s*\n(.*?)(?=\s*={40,}\s*\n|\Z)",
    re.DOTALL,
)
STANDARD_FILE_PATTERN = re.compile(r"^(\d{2})_(\d{2})_(\d{2})(?:_(\d+))?\.txt$")
RANGE_FILE_PATTERN = re.compile(r"^(\d{2})-(\d{2})_(\d{2})_(\d{2})\.txt$")

MONTH_NAMES_GENITIVE = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)
MONTH_TO_NUM = {name: index + 1 for index, name in enumerate(MONTH_NAMES_GENITIVE)}
WEEKDAY_TO_NUM = {
    "понедельник": 0,
    "вторник": 1,
    "среда": 2,
    "четверг": 3,
    "пятница": 4,
    "суббота": 5,
    "воскресенье": 6,
}
NUM_TO_WEEKDAY = {index: name for name, index in WEEKDAY_TO_NUM.items()}
YEAR_RANGE = range(2021, 2027)
DAY_WEEKDAY_PATTERN = re.compile(
    r"(\d{1,2})\s+"
    r"(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)"
    r"(?:\s+(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье))?",
    re.IGNORECASE,
)
TEXT_YEAR_PATTERN = re.compile(r"\b(202[1-6])\b")
YearSource = Literal["weekday", "text_year", "filename"]


class ParsedNote(TypedDict):
    entry_date: str
    title: str
    content: str
    source_file: str
    suffix: int
    year_source: YearSource
    filename_year: int


def _month_name(month: int) -> str:
    return MONTH_NAMES_GENITIVE[month - 1]


def resolve_entry_year(day: int, month: int, filename_year: int, text: str) -> tuple[int, YearSource]:
    match = DAY_WEEKDAY_PATTERN.search(text[:300])
    if match and match.group(3):
        day_in_text = int(match.group(1))
        month_in_text = MONTH_TO_NUM[match.group(2).lower()]
        weekday = WEEKDAY_TO_NUM[match.group(3).lower()]
        if day_in_text == day and month_in_text == month:
            candidates = [
                year
                for year in YEAR_RANGE
                if date(year, month, day).weekday() == weekday
            ]
            if filename_year in candidates:
                return filename_year, "filename"
            nearby = [year for year in candidates if abs(year - filename_year) <= 1]
            if len(nearby) == 1:
                return nearby[0], "weekday"
            return filename_year, "filename"

    text_year_match = TEXT_YEAR_PATTERN.search(text[:200])
    if text_year_match:
        return int(text_year_match.group(1)), "text_year"

    return filename_year, "filename"


def parse_text_weekday(text: str) -> tuple[int, int, str] | None:
    match = DAY_WEEKDAY_PATTERN.search(text[:300])
    if not match or not match.group(3):
        return None
    return (
        int(match.group(1)),
        MONTH_TO_NUM[match.group(2).lower()],
        match.group(3).lower(),
    )


def validate_weekday_consistency(entry_date: str, text: str) -> dict[str, object]:
    parsed = parse_text_weekday(text)
    if parsed is None:
        return {"has_weekday": False, "matches": None}

    day_in_text, month_in_text, text_weekday = parsed
    entry = date.fromisoformat(entry_date)
    date_weekday = NUM_TO_WEEKDAY[entry.weekday()]
    matches = (
        day_in_text == entry.day
        and month_in_text == entry.month
        and WEEKDAY_TO_NUM[text_weekday] == entry.weekday()
    )
    return {
        "has_weekday": True,
        "matches": matches,
        "text_weekday": text_weekday,
        "date_weekday": date_weekday,
        "text_day": day_in_text,
        "text_month": month_in_text,
    }


def build_note_title(filename: str, entry_date: str) -> str:
    year, month, day = entry_date.split("-")
    month_name = _month_name(int(month))

    range_match = RANGE_FILE_PATTERN.match(filename)
    if range_match:
        day_start, day_end, _, _ = range_match.groups()
        return f"{int(day_start)}-{int(day_end)} {month_name} {year}"

    return f"{int(day)} {month_name} {year}"


def parse_life_notes_file(path: Path) -> list[ParsedNote]:
    text = path.read_text(encoding="utf-8")
    parsed: list[ParsedNote] = []

    for match in BLOCK_PATTERN.finditer(text):
        day, month, year = match.groups()[:3]
        body = match.group(4).strip()
        if not body:
            continue

        entry_date = f"{year}-{month}-{day}"
        parsed.append(
            {
                "entry_date": entry_date,
                "title": f"{int(day)} {_month_name(int(month))} {year}",
                "content": body,
                "source_file": path.name,
                "suffix": 1,
                "year_source": "filename",
                "filename_year": int(year),
            }
        )

    parsed.sort(key=lambda item: (item["entry_date"], item["suffix"], item["source_file"]))
    return parsed


def _parse_dir_filename(filename: str) -> tuple[int, int, int, int] | None:
    match = STANDARD_FILE_PATTERN.match(filename)
    if match:
        day, month, year_suffix, entry_suffix = match.groups()
        year = int(year_suffix)
        if year <= 20:
            return None
        return (
            int(day),
            int(month),
            int(entry_suffix or 1),
            2000 + year,
        )

    match = RANGE_FILE_PATTERN.match(filename)
    if match:
        day_start, _day_end, month, year_suffix = match.groups()
        year = int(year_suffix)
        if year <= 20:
            return None
        return (
            int(day_start),
            int(month),
            1,
            2000 + year,
        )

    return None


def parse_life_notes_dir(path: Path) -> tuple[list[ParsedNote], dict[str, int]]:
    parsed: list[ParsedNote] = []
    stats = {
        "total_files": 0,
        "excluded_meta": 0,
        "excluded_year": 0,
        "excluded_unparsed": 0,
        "excluded_empty": 0,
        "year_corrected": 0,
    }

    for file_path in sorted(path.glob("*.txt")):
        stats["total_files"] += 1
        filename = file_path.name

        if filename in SKIP_DIR_FILES:
            stats["excluded_meta"] += 1
            continue

        parsed_name = _parse_dir_filename(filename)
        if parsed_name is None:
            if STANDARD_FILE_PATTERN.match(filename) or RANGE_FILE_PATTERN.match(filename):
                stats["excluded_year"] += 1
            else:
                stats["excluded_unparsed"] += 1
            continue

        day, month, suffix, filename_year = parsed_name
        content = file_path.read_text(encoding="utf-8").strip()
        if not content:
            stats["excluded_empty"] += 1
            continue

        resolved_year, year_source = resolve_entry_year(day, month, filename_year, content)
        if resolved_year != filename_year:
            stats["year_corrected"] += 1

        entry_date = f"{resolved_year}-{month:02d}-{day:02d}"
        parsed.append(
            {
                "entry_date": entry_date,
                "title": build_note_title(filename, entry_date),
                "content": content,
                "source_file": filename,
                "suffix": suffix,
                "year_source": year_source,
                "filename_year": filename_year,
            }
        )

    parsed.sort(key=lambda item: (item["entry_date"], item["suffix"], item["source_file"]))
    parsed.reverse()
    return parsed, stats


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


def existing_life_note_source_files(db, user_id: uuid.UUID) -> set[str]:
    entries = db.scalars(
        select(Entry).where(Entry.user_id == user_id, Entry.type == "diary")
    ).all()
    source_files: set[str] = set()
    for entry in entries:
        if entry.metadata_.get("collection") != LIFE_NOTES_COLLECTION:
            continue
        source_file = entry.metadata_.get("source_file")
        if isinstance(source_file, str) and source_file:
            source_files.add(source_file)
    return source_files


def delete_life_notes(db, user_id: uuid.UUID) -> int:
    entries = db.scalars(
        select(Entry).where(Entry.user_id == user_id, Entry.type == "diary")
    ).all()
    to_delete = [
        entry
        for entry in entries
        if entry.metadata_.get("collection") == LIFE_NOTES_COLLECTION
    ]
    for entry in to_delete:
        db.delete(entry)
    return len(to_delete)


def _import_notes(
    *,
    notes: list[ParsedNote],
    email: str,
    dry_run: bool,
    replace: bool,
    source_label: str,
) -> dict[str, int | dict[str, int] | None]:
    if not notes:
        raise RuntimeError("Не удалось найти записи для импорта")

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            raise RuntimeError(f"Пользователь не найден: {email}")

        deleted = 0
        if replace:
            if dry_run:
                entries = db.scalars(
                    select(Entry).where(Entry.user_id == user.id, Entry.type == "diary")
                ).all()
                deleted = sum(
                    1
                    for entry in entries
                    if entry.metadata_.get("collection") == LIFE_NOTES_COLLECTION
                )
            else:
                deleted = delete_life_notes(db, user.id)
                db.commit()

        existing_dates = set() if replace else existing_life_note_dates(db, user.id)
        existing_source_files = (
            set() if replace else existing_life_note_source_files(db, user.id)
        )
        created = 0
        skipped = 0

        for note in notes:
            if source_label == "import_life_notes_dir":
                if note["source_file"] in existing_source_files:
                    skipped += 1
                    continue
            elif note["entry_date"] in existing_dates:
                skipped += 1
                continue

            note_metadata: dict[str, object] = {
                "mode": "diary",
                "entry_date": note["entry_date"],
                "collection": LIFE_NOTES_COLLECTION,
                "category": DEFAULT_CATEGORY,
                "source": source_label,
            }
            if source_label == "import_life_notes_dir":
                note_metadata["source_file"] = note["source_file"]
                note_metadata["year_source"] = note["year_source"]
                resolved_year = int(note["entry_date"].split("-")[0])
                if note["filename_year"] != resolved_year:
                    note_metadata["filename_year"] = note["filename_year"]

            metadata = normalize_metadata(
                EntryType.diary,
                note_metadata,
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
            "deleted": deleted,
            "dir_stats": None,
        }
    finally:
        db.close()


def import_life_notes(
    *,
    source_path: Path,
    email: str,
    dry_run: bool = False,
    replace: bool = False,
) -> dict[str, int | dict[str, int] | None]:
    notes = parse_life_notes_file(source_path)
    return _import_notes(
        notes=notes,
        email=email,
        dry_run=dry_run,
        replace=replace,
        source_label="import_life_notes",
    )


def import_life_notes_dir(
    *,
    source_dir: Path,
    email: str,
    dry_run: bool = False,
    replace: bool = False,
) -> dict[str, int | dict[str, int] | None]:
    notes, dir_stats = parse_life_notes_dir(source_dir)
    result = _import_notes(
        notes=notes,
        email=email,
        dry_run=dry_run,
        replace=replace,
        source_label="import_life_notes_dir",
    )
    result["dir_stats"] = dir_stats
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Импорт дневника в раздел «Заметки».")
    source_group = parser.add_mutually_exclusive_group()
    source_group.add_argument(
        "--source",
        type=Path,
        default=None,
        help="Путь к файлу жизнь_ванечки.txt",
    )
    source_group.add_argument(
        "--source-dir",
        type=Path,
        default=None,
        help="Путь к папке с отдельными txt-файлами заметок",
    )
    parser.add_argument(
        "--email",
        default=DEFAULT_EMAIL,
        help="Email пользователя, для которого импортируются записи",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Удалить существующие life_notes перед импортом",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Только посчитать записи без записи в БД",
    )
    args = parser.parse_args()

    source_dir = args.source_dir
    source_path = args.source

    if source_dir is None and source_path is None:
        source_path = DEFAULT_SOURCE

    if source_dir is not None:
        if not source_dir.is_dir():
            print(f"Папка не найдена: {source_dir}", file=sys.stderr)
            return 1
        result = import_life_notes_dir(
            source_dir=source_dir,
            email=args.email,
            dry_run=args.dry_run,
            replace=args.replace,
        )
        notes, _ = parse_life_notes_dir(source_dir)
    else:
        assert source_path is not None
        if not source_path.exists():
            print(f"Файл не найден: {source_path}", file=sys.stderr)
            return 1
        result = import_life_notes(
            source_path=source_path,
            email=args.email,
            dry_run=args.dry_run,
            replace=args.replace,
        )
        notes = parse_life_notes_file(source_path)

    mode = "dry-run" if args.dry_run else "import"
    print(
        f"[{mode}] parsed={result['parsed']} created={result['created']} "
        f"skipped={result['skipped']} deleted={result['deleted']} user={args.email}"
    )

    dir_stats = result.get("dir_stats")
    if isinstance(dir_stats, dict):
        print(
            "dir_stats: "
            f"total_files={dir_stats['total_files']} "
            f"excluded_meta={dir_stats['excluded_meta']} "
            f"excluded_year={dir_stats['excluded_year']} "
            f"excluded_unparsed={dir_stats['excluded_unparsed']} "
            f"excluded_empty={dir_stats['excluded_empty']} "
            f"year_corrected={dir_stats.get('year_corrected', 0)}"
        )

    if notes:
        print(f"first={notes[0]['entry_date']} last={notes[-1]['entry_date']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
