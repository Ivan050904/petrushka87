from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.models.entry import Entry  # noqa: E402
from app.models.transcription import TranscriptionJob  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.embeddings.indexer import index_entry, index_transcription_job  # noqa: E402


def _resolve_user(db, email: str | None) -> User:
    if email:
        user = db.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            raise SystemExit(f"User not found: {email}")
        return user
    user = db.scalar(select(User).order_by(User.created_at.asc()))
    if user is None:
        raise SystemExit("No users in database")
    return user


def reindex_user(db, user_id: uuid.UUID, *, dry_run: bool, batch_size: int) -> dict[str, int]:
    stats = {"entries_indexed": 0, "entries_skipped": 0, "jobs_indexed": 0, "jobs_skipped": 0, "errors": 0}

    entries = db.scalars(select(Entry).where(Entry.user_id == user_id).order_by(Entry.updated_at.desc())).all()
    for index, entry in enumerate(entries, start=1):
        try:
            if dry_run:
                stats["entries_indexed"] += 1
            else:
                chunks = index_entry(db, entry)
                if chunks:
                    stats["entries_indexed"] += 1
                else:
                    stats["entries_skipped"] += 1
        except Exception:  # noqa: BLE001
            stats["errors"] += 1
        if not dry_run and index % batch_size == 0:
            db.commit()

    jobs = db.scalars(
        select(TranscriptionJob)
        .where(TranscriptionJob.user_id == user_id, TranscriptionJob.status == "done")
        .order_by(TranscriptionJob.updated_at.desc())
    ).all()
    for index, job in enumerate(jobs, start=1):
        try:
            if dry_run:
                stats["jobs_indexed"] += 1
            else:
                chunks = index_transcription_job(db, job)
                if chunks:
                    stats["jobs_indexed"] += 1
                else:
                    stats["jobs_skipped"] += 1
        except Exception:  # noqa: BLE001
            stats["errors"] += 1
        if not dry_run and index % batch_size == 0:
            db.commit()

    if not dry_run:
        db.commit()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill entry/transcription embeddings for RAG search.")
    parser.add_argument("--user-email", default=None, help="User email (default: first user in DB)")
    parser.add_argument("--dry-run", action="store_true", help="Count records without writing embeddings")
    parser.add_argument("--batch-size", type=int, default=100, help="Commit every N records")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = _resolve_user(db, args.user_email)
        stats = reindex_user(db, user.id, dry_run=args.dry_run, batch_size=max(1, args.batch_size))
        mode = "DRY RUN" if args.dry_run else "DONE"
        print(f"[{mode}] user={user.email}")
        print(
            "entries_indexed={entries_indexed} entries_skipped={entries_skipped} "
            "jobs_indexed={jobs_indexed} jobs_skipped={jobs_skipped} errors={errors}".format(**stats)
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
