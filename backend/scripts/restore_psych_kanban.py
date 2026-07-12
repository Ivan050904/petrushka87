"""Restore missing kanban_psych entries from git-tracked DB into local folio_one.db."""
from __future__ import annotations

import json
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
LOCAL_DB = BACKEND / "storage" / "folio_one.db"
GIT_DB = BACKEND / "storage" / "folio_one_from_git.db"
PETR_EMAIL = "petr@petr.local"


def extract_git_db() -> None:
    data = subprocess.check_output(["git", "show", "HEAD:backend/storage/folio_one.db"], cwd=ROOT)
    GIT_DB.write_bytes(data)


def get_user_id(conn: sqlite3.Connection, email: str) -> str | None:
    row = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
    return row[0] if row else None


def restore_psych_cards(*, dry_run: bool = False) -> dict:
    if not GIT_DB.exists():
        extract_git_db()

    local = sqlite3.connect(LOCAL_DB)
    local.row_factory = sqlite3.Row
    git = sqlite3.connect(GIT_DB)
    git.row_factory = sqlite3.Row

    try:
        user_id = get_user_id(local, PETR_EMAIL)
        if not user_id:
            raise RuntimeError(f"User not found in local DB: {PETR_EMAIL}")

        git_user_id = get_user_id(git, PETR_EMAIL)
        if not git_user_id:
            raise RuntimeError(f"User not found in git DB: {PETR_EMAIL}")

        git_rows = git.execute(
            """
            SELECT * FROM entries
            WHERE user_id=? AND type='note'
            AND json_extract(metadata, '$.board') = 'kanban_psych'
            """,
            (git_user_id,),
        ).fetchall()

        restored = []
        skipped = []
        for row in git_rows:
            existing = local.execute("SELECT id FROM entries WHERE id=?", (row["id"],)).fetchone()
            if existing:
                skipped.append(row["id"])
                continue
            if dry_run:
                restored.append({"id": row["id"], "title": row["title"], "action": "would_insert"})
                continue

            columns = row.keys()
            values = [row[col] for col in columns]
            # Re-bind to local petr user id in case uuids differ (they shouldn't for same id)
            data = dict(row)
            data["user_id"] = user_id
            placeholders = ", ".join("?" for _ in columns)
            col_names = ", ".join(columns)
            local.execute(
                f"INSERT INTO entries ({col_names}) VALUES ({placeholders})",
                [data[col] for col in columns],
            )
            restored.append({"id": row["id"], "title": row["title"], "action": "inserted"})

        if not dry_run and restored:
            local.commit()

        return {
            "git_psych_count": len(git_rows),
            "restored": restored,
            "skipped_existing": skipped,
            "dry_run": dry_run,
        }
    finally:
        local.close()
        git.close()


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    backup = LOCAL_DB.with_suffix(
        f".backup-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.db"
    )
    if not dry_run:
        shutil.copy2(LOCAL_DB, backup)
        print(f"backup: {backup}")

    result = restore_psych_cards(dry_run=dry_run)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
