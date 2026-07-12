from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import SessionLocal  # noqa: E402
from app.services.context.entity_search import populate_entries_fts  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Populate SQLite FTS5 index for entries.")
    args = parser.parse_args()
    del args

    db = SessionLocal()
    try:
        count = populate_entries_fts(db)
        print(f"Populated entries_fts with {count} rows.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
