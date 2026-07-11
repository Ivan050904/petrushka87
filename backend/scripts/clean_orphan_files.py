"""Remove storage/files entries not referenced by any resource entry."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entry import Entry
from app.schemas.entry import EntryType


def main() -> int:
    storage_root = Path(settings.local_storage_path)
    if not storage_root.exists():
        print("[clean] no storage directory")
        return 0

    referenced: set[str] = set()
    with SessionLocal() as db:
        rows = db.scalars(select(Entry).where(Entry.type == EntryType.resource.value)).all()
        for entry in rows:
            file_meta = (entry.metadata_ or {}).get("file") or {}
            key = file_meta.get("key")
            if isinstance(key, str) and key.strip():
                referenced.add(key.strip())

    removed = 0
    for path in storage_root.iterdir():
        if not path.is_file():
            continue
        if path.name not in referenced:
            path.unlink(missing_ok=True)
            removed += 1

    print(f"[clean] removed {removed} orphan file(s), kept {len(referenced)} referenced")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
