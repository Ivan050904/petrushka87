from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import SessionLocal  # noqa: E402
from app.models.entry import Entry  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.entry import EntryType  # noqa: E402
from app.schemas.metadata import normalize_metadata  # noqa: E402
from app.services.demo_seed import DEMO_EMAIL  # noqa: E402
from app.services.finance_excel_import import (  # noqa: E402
    parse_finance_workbook,
    row_to_entry_payload,
)


@dataclass(frozen=True)
class FinanceExcelImportResult:
    user_email: str
    user_full_name: str | None
    sheet_count: int
    expense_count: int
    income_count: int
    expense_total: float
    income_total: float
    category_count: int
    created: int
    skipped: int


def resolve_target_user(db, email: str | None = None) -> User | None:
    if email:
        return db.scalar(select(User).where(User.email == email.strip().lower()))

    users = list(db.scalars(select(User).order_by(User.created_at.desc())))
    for user in users:
        full_name = (user.full_name or "").casefold()
        if "петр" in full_name or "petr" in full_name or "peter" in full_name:
            return user

    for user in users:
        if user.email.lower() != DEMO_EMAIL:
            return user

    return users[0] if users else None


def collect_existing_external_ids(db, user_id) -> set[str]:
    entries = db.scalars(
        select(Entry).where(Entry.user_id == user_id, Entry.type == EntryType.finance.value)
    ).all()
    external_ids: set[str] = set()
    for entry in entries:
        external_id = entry.metadata_.get("external_id")
        if isinstance(external_id, str) and external_id.strip():
            external_ids.add(external_id)
    return external_ids


def import_finance_workbook(
    *,
    file_path: str | Path,
    email: str | None = None,
    dry_run: bool = False,
) -> FinanceExcelImportResult:
    parsed = parse_finance_workbook(file_path)

    with SessionLocal() as db:
        user = resolve_target_user(db, email=email)
        if user is None:
            raise RuntimeError("Target user not found in database.")

        existing_external_ids = collect_existing_external_ids(db, user.id)
        created = 0
        skipped = 0

        for row in parsed.rows:
            if row.external_id in existing_external_ids:
                skipped += 1
                continue

            payload = row_to_entry_payload(row)
            metadata = normalize_metadata(EntryType.finance, payload["metadata"])
            if not dry_run:
                entry = Entry(
                    user_id=user.id,
                    type=EntryType.finance.value,
                    title=str(payload["title"]),
                    content=str(payload["content"]),
                    metadata_=metadata,
                )
                entry.created_at = payload["created_at"]
                entry.updated_at = payload["created_at"]
                db.add(entry)
            existing_external_ids.add(row.external_id)
            created += 1

        if not dry_run:
            db.commit()

        return FinanceExcelImportResult(
            user_email=user.email,
            user_full_name=user.full_name,
            sheet_count=parsed.sheet_count,
            expense_count=parsed.expense_count,
            income_count=parsed.income_count,
            expense_total=parsed.expense_total,
            income_total=parsed.income_total,
            category_count=len(parsed.categories),
            created=created,
            skipped=skipped,
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="One-time finance import from Excel workbook.")
    parser.add_argument("--file", required=True, help="Path to .xlsx file")
    parser.add_argument("--email", help="Target user email (optional)")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, do not write to DB")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        print(f"File not found: {file_path}")
        return 1

    with SessionLocal() as db:
        user = resolve_target_user(db, email=args.email)
        if user is None:
            print("Target user not found.")
            return 1
        print(f"Target user: {user.full_name or user.email} ({user.email})")

    if not args.yes and not args.dry_run:
        answer = input("Import finance data for this user? [y/N]: ").strip().casefold()
        if answer not in {"y", "yes", "д", "да"}:
            print("Cancelled.")
            return 0

    result = import_finance_workbook(
        file_path=file_path,
        email=args.email,
        dry_run=args.dry_run,
    )

    print(f"Sheets processed: {result.sheet_count}")
    print(f"Expenses: {result.expense_count} ({result.expense_total:,.2f} RUB)")
    print(f"Income: {result.income_count} ({result.income_total:,.2f} RUB)")
    print(f"Unique categories: {result.category_count}")
    print(f"Created entries: {result.created}")
    print(f"Skipped duplicates: {result.skipped}")
    if args.dry_run:
        print("Dry run only — no data was written.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
