"""Quick inspect of finance entries in folio_one.db."""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "storage" / "folio_one.db"


def main() -> None:
    print(f"=== {DB} ({DB.stat().st_size if DB.exists() else 0} bytes) ===")
    if not DB.exists():
        print("missing")
        return
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    for email, name, user_id in cur.execute("SELECT email, full_name, id FROM users"):
        n = cur.execute(
            "SELECT COUNT(*) FROM entries WHERE user_id = ? AND type = 'finance'",
            (user_id,),
        ).fetchone()[0]
        print(f"  {email} ({name}): {n} finance entries")
    conn.close()


if __name__ == "__main__":
    main()
