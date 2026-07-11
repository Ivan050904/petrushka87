from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_alembic_upgrade_head_on_empty_db(tmp_path: Path) -> None:
    db_path = tmp_path / "alembic_smoke.db"
    database_url = f"sqlite:///{db_path.as_posix()}"

    env = {
        **dict(__import__("os").environ),
        "DATABASE_URL": database_url,
    }

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout

    engine = create_engine(database_url)
    tables = set(inspect(engine).get_table_names())
    engine.dispose()

    expected = {
        "alembic_version",
        "users",
        "entries",
        "transcription_jobs",
        "transcription_chats",
        "transcription_chat_messages",
        "entry_links",
        "assistant_conversations",
        "assistant_messages",
        "entry_embeddings",
        "assistant_sessions",
    }
    assert expected.issubset(tables)
