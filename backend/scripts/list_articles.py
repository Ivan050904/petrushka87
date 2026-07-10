from __future__ import annotations

import json
import sqlite3
from pathlib import Path

db_path = Path(__file__).resolve().parents[1] / "storage" / "folio_one.db"
rows = sqlite3.connect(db_path).execute(
    """
    SELECT title, metadata
    FROM entries
    WHERE json_extract(metadata, '$.kind') = 'article'
    ORDER BY created_at DESC
    LIMIT 5
    """
).fetchall()

for title, metadata_raw in rows:
    metadata = json.loads(metadata_raw)
    print(f"- {title}")
    print(f"  {metadata.get('url', '')}")
    summary = metadata.get("summary_ru") or ""
    if summary:
        print(f"  {summary[:100]}")
