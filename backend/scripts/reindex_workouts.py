from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import joinedload  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.workout import WorkoutExercise, WorkoutSession  # noqa: E402
from app.services.embeddings.indexer import index_entry  # noqa: E402
from app.services.workouts.entry_sync import sync_entry_for_session  # noqa: E402


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


def reindex_workouts(db, user_id: uuid.UUID, *, dry_run: bool) -> dict[str, int]:
    stats = {"sessions_synced": 0, "sessions_skipped": 0, "errors": 0}
    statement = (
        select(WorkoutSession)
        .options(joinedload(WorkoutSession.exercises).joinedload(WorkoutExercise.exercise))
        .where(WorkoutSession.user_id == user_id)
        .order_by(WorkoutSession.date.desc())
    )
    sessions = db.execute(statement).unique().scalars().all()
    for session in sessions:
        try:
            if dry_run:
                stats["sessions_synced"] += 1
                continue
            entry = sync_entry_for_session(db, session)
            chunks = index_entry(db, entry)
            if chunks:
                stats["sessions_synced"] += 1
            else:
                stats["sessions_skipped"] += 1
        except Exception:  # noqa: BLE001
            stats["errors"] += 1
    if not dry_run:
        db.commit()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync workout sessions to entries and index embeddings.")
    parser.add_argument("--user-email", default=None, help="User email (default: first user in DB)")
    parser.add_argument("--dry-run", action="store_true", help="Count sessions without writing")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = _resolve_user(db, args.user_email)
        stats = reindex_workouts(db, user.id, dry_run=args.dry_run)
        mode = "DRY RUN" if args.dry_run else "DONE"
        print(f"[{mode}] user={user.email}")
        print(
            "sessions_synced={sessions_synced} sessions_skipped={sessions_skipped} errors={errors}".format(**stats)
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
