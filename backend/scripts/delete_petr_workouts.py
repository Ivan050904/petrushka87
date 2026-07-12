"""Delete all gym workout data for petr@petr.local."""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "storage" / "folio_one.db"
PETR_EMAIL = "petr@petr.local"


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    if not DB.exists():
        print(f"Database not found: {DB}")
        sys.exit(1)

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    user = cur.execute("SELECT id, email, full_name FROM users WHERE email = ?", (PETR_EMAIL,)).fetchone()
    if user is None:
        print(f"User not found: {PETR_EMAIL}")
        sys.exit(1)

    uid = user["id"]
    print(f"User: {user['full_name']} ({user['email']}) id={uid}")

    counts = {
        "workout_sessions": cur.execute(
            "SELECT COUNT(*) FROM workout_sessions WHERE user_id = ?", (uid,)
        ).fetchone()[0],
        "workout_exercises": cur.execute(
            """
            SELECT COUNT(*) FROM workout_exercises we
            JOIN workout_sessions ws ON we.workout_id = ws.id
            WHERE ws.user_id = ?
            """,
            (uid,),
        ).fetchone()[0],
        "exercise_catalog": cur.execute(
            "SELECT COUNT(*) FROM exercise_catalog WHERE user_id = ?", (uid,)
        ).fetchone()[0],
        "personal_records": cur.execute(
            "SELECT COUNT(*) FROM personal_records WHERE user_id = ?", (uid,)
        ).fetchone()[0],
        "entries_workout": cur.execute(
            "SELECT COUNT(*) FROM entries WHERE user_id = ? AND type = 'workout'", (uid,)
        ).fetchone()[0],
    }
    print("Before:", counts)

    if dry_run:
        print("Dry run — no changes made.")
        conn.close()
        return

    entry_ids = [
        row[0]
        for row in cur.execute(
            "SELECT id FROM entries WHERE user_id = ? AND type = 'workout'", (uid,)
        ).fetchall()
    ]
    session_entry_ids = [
        row[0]
        for row in cur.execute(
            "SELECT entry_id FROM workout_sessions WHERE user_id = ? AND entry_id IS NOT NULL", (uid,)
        ).fetchall()
    ]
    all_entry_ids = list({*entry_ids, *session_entry_ids})

    cur.execute("DELETE FROM workout_sessions WHERE user_id = ?", (uid,))
    cur.execute("DELETE FROM personal_records WHERE user_id = ?", (uid,))
    cur.execute("DELETE FROM exercise_catalog WHERE user_id = ?", (uid,))

    for entry_id in all_entry_ids:
        cur.execute("DELETE FROM entry_links WHERE source_entry_id = ? OR target_entry_id = ?", (entry_id, entry_id))
        cur.execute("DELETE FROM entry_embeddings WHERE entry_id = ?", (entry_id,))
        cur.execute("DELETE FROM entries WHERE id = ? AND user_id = ?", (entry_id, uid))

    cur.execute(
        """
        DELETE FROM entry_embeddings
        WHERE entry_id NOT IN (SELECT id FROM entries)
        """
    )

    conn.commit()

    after = {
        "workout_sessions": cur.execute(
            "SELECT COUNT(*) FROM workout_sessions WHERE user_id = ?", (uid,)
        ).fetchone()[0],
        "workout_exercises": cur.execute(
            """
            SELECT COUNT(*) FROM workout_exercises we
            JOIN workout_sessions ws ON we.workout_id = ws.id
            WHERE ws.user_id = ?
            """,
            (uid,),
        ).fetchone()[0],
        "exercise_catalog": cur.execute(
            "SELECT COUNT(*) FROM exercise_catalog WHERE user_id = ?", (uid,)
        ).fetchone()[0],
        "personal_records": cur.execute(
            "SELECT COUNT(*) FROM personal_records WHERE user_id = ?", (uid,)
        ).fetchone()[0],
        "entries_workout": cur.execute(
            "SELECT COUNT(*) FROM entries WHERE user_id = ? AND type = 'workout'", (uid,)
        ).fetchone()[0],
    }
    print("After:", after)

    orphan_embeddings = cur.execute(
        "SELECT COUNT(*) FROM entry_embeddings ee LEFT JOIN entries e ON ee.entry_id = e.id WHERE e.id IS NULL"
    ).fetchone()[0]
    print(f"Orphan embeddings: {orphan_embeddings}")
    print("Done.")
    conn.close()


if __name__ == "__main__":
    main()
