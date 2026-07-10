from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = BACKEND_ROOT / "storage" / "letscore.db"
DEFAULT_TARGET = BACKEND_ROOT / "storage" / "folio_one.db"
DEFAULT_EMAIL = "petr@petr.local"


def table_columns(connection: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in connection.execute(f"pragma table_info({table})").fetchall()]


def copy_rows(
    source: sqlite3.Connection,
    target: sqlite3.Connection,
    *,
    table: str,
    rows: list[tuple],
    remap: dict[str, str] | None = None,
) -> int:
    if not rows:
        return 0

    columns = table_columns(source, table)
    placeholders = ", ".join("?" for _ in columns)
    column_sql = ", ".join(columns)
    insert_sql = f"insert or ignore into {table} ({column_sql}) values ({placeholders})"

    inserted = 0
    for row in rows:
        payload = list(row)
        if remap:
            payload = [remap.get(column, value) if isinstance(column, str) else value for column, value in zip(columns, payload)]
            payload = []
            for column, value in zip(columns, row):
                payload.append(remap.get(column, value))
        try:
            target.execute(insert_sql, payload)
            if target.rowcount:
                inserted += 1
        except sqlite3.IntegrityError:
            continue

    return inserted


def migrate_user(
    *,
    email: str,
    source_path: Path,
    target_path: Path,
) -> dict[str, int]:
    if not source_path.exists():
        raise FileNotFoundError(f"Source database not found: {source_path}")
    if not target_path.exists():
        raise FileNotFoundError(f"Target database not found: {target_path}")

    source = sqlite3.connect(source_path)
    target = sqlite3.connect(target_path)
    source.row_factory = sqlite3.Row
    target.row_factory = sqlite3.Row

    try:
        old_user = source.execute("select id, email, full_name from users where email = ?", (email,)).fetchone()
        new_user = target.execute("select id, email, full_name from users where email = ?", (email,)).fetchone()
        if old_user is None:
            raise RuntimeError(f"User not found in source DB: {email}")
        if new_user is None:
            raise RuntimeError(f"User not found in target DB: {email}. Create the account first.")

        old_user_id = old_user["id"]
        new_user_id = new_user["id"]
        user_remap = {"user_id": new_user_id}

        entry_rows = source.execute(
            "select * from entries where user_id = ?",
            (old_user_id,),
        ).fetchall()
        entry_ids = [row["id"] for row in entry_rows]

        stats: dict[str, int] = {"entries": 0, "entry_embeddings": 0, "entry_links": 0, "transcription_jobs": 0, "transcription_chats": 0, "transcription_chat_messages": 0}

        entry_columns = table_columns(source, "entries")
        entry_insert = f"insert or ignore into entries ({', '.join(entry_columns)}) values ({', '.join('?' for _ in entry_columns)})"
        for row in entry_rows:
            payload = [new_user_id if column == "user_id" else row[column] for column in entry_columns]
            cursor = target.execute(entry_insert, payload)
            if cursor.rowcount:
                stats["entries"] += 1

        if entry_ids:
            placeholders = ", ".join("?" for _ in entry_ids)

            embedding_rows = source.execute(
                f"select * from entry_embeddings where user_id = ? and entry_id in ({placeholders})",
                [old_user_id, *entry_ids],
            ).fetchall()
            embedding_columns = table_columns(source, "entry_embeddings")
            embedding_insert = f"insert or ignore into entry_embeddings ({', '.join(embedding_columns)}) values ({', '.join('?' for _ in embedding_columns)})"
            for row in embedding_rows:
                payload = [new_user_id if column == "user_id" else row[column] for column in embedding_columns]
                cursor = target.execute(embedding_insert, payload)
                if cursor.rowcount:
                    stats["entry_embeddings"] += 1

            link_rows = source.execute(
                f"select * from entry_links where user_id = ? and source_entry_id in ({placeholders}) and target_entry_id in ({placeholders})",
                [old_user_id, *entry_ids, *entry_ids],
            ).fetchall()
            link_columns = table_columns(source, "entry_links")
            link_insert = f"insert or ignore into entry_links ({', '.join(link_columns)}) values ({', '.join('?' for _ in link_columns)})"
            for row in link_rows:
                payload = [new_user_id if column == "user_id" else row[column] for column in link_columns]
                cursor = target.execute(link_insert, payload)
                if cursor.rowcount:
                    stats["entry_links"] += 1

        job_rows = source.execute(
            "select * from transcription_jobs where user_id = ?",
            (old_user_id,),
        ).fetchall()
        job_columns = table_columns(source, "transcription_jobs")
        job_insert = f"insert or ignore into transcription_jobs ({', '.join(job_columns)}) values ({', '.join('?' for _ in job_columns)})"
        job_id_map: dict[int, int] = {}
        for row in job_rows:
            payload = [new_user_id if column == "user_id" else row[column] for column in job_columns]
            old_job_id = row["id"]
            cursor = target.execute(job_insert, payload)
            if cursor.rowcount:
                stats["transcription_jobs"] += 1
                job_id_map[old_job_id] = old_job_id
            else:
                    existing = target.execute(
                        "select id from transcription_jobs where user_id = ? and url = ?",
                        (new_user_id, row["url"]),
                    ).fetchone()
                    if existing:
                        job_id_map[old_job_id] = existing["id"]

        chat_rows = source.execute(
            "select * from transcription_chats where user_id = ?",
            (old_user_id,),
        ).fetchall()
        chat_columns = table_columns(source, "transcription_chats")
        chat_insert = f"insert or ignore into transcription_chats ({', '.join(chat_columns)}) values ({', '.join('?' for _ in chat_columns)})"
        chat_id_map: dict[int, int] = {}
        for row in chat_rows:
            mapped_job_id = job_id_map.get(row["job_id"])
            if mapped_job_id is None:
                continue
            payload = []
            for column in chat_columns:
                if column == "user_id":
                    payload.append(new_user_id)
                elif column == "job_id":
                    payload.append(mapped_job_id)
                else:
                    payload.append(row[column])
            old_chat_id = row["id"]
            cursor = target.execute(chat_insert, payload)
            if cursor.rowcount:
                stats["transcription_chats"] += 1
                chat_id_map[old_chat_id] = row["id"]
            else:
                    existing = target.execute(
                        "select id from transcription_chats where user_id = ? and job_id = ?",
                        (new_user_id, mapped_job_id),
                    ).fetchone()
                    if existing:
                        chat_id_map[old_chat_id] = existing["id"]

        if chat_id_map:
            old_chat_ids = list(chat_id_map.keys())
            placeholders = ", ".join("?" for _ in old_chat_ids)
            message_rows = source.execute(
                f"select * from transcription_chat_messages where chat_id in ({placeholders})",
                old_chat_ids,
            ).fetchall()
            message_columns = table_columns(source, "transcription_chat_messages")
            message_insert = f"insert or ignore into transcription_chat_messages ({', '.join(message_columns)}) values ({', '.join('?' for _ in message_columns)})"
            for row in message_rows:
                mapped_chat_id = chat_id_map.get(row["chat_id"])
                if mapped_chat_id is None:
                    continue
                payload = [mapped_chat_id if column == "chat_id" else row[column] for column in message_columns]
                cursor = target.execute(message_insert, payload)
                if cursor.rowcount:
                    stats["transcription_chat_messages"] += 1

        target.commit()

        final_count = target.execute(
            "select count(*) from entries where user_id = ?",
            (new_user_id,),
        ).fetchone()[0]
        stats["entries_total"] = final_count
        return stats
    finally:
        source.close()
        target.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate one user's data from letscore.db into folio_one.db")
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    args = parser.parse_args()

    stats = migrate_user(email=args.email.lower(), source_path=args.source, target_path=args.target)
    print(f"Migrated user: {args.email}")
    for key, value in stats.items():
        print(f"  {key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
