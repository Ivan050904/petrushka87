from __future__ import annotations

from logging.config import fileConfig
from pathlib import Path
import sys

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models import entry, user  # noqa: F401,E402

config = context.config
config.set_main_option("sqlalchemy.url", str(settings.database_url))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _ensure_sqlite_parent(database_url: str) -> None:
    if not database_url.startswith("sqlite:///"):
        return

    db_path = database_url.replace("sqlite:///", "", 1)
    if not db_path or db_path == ":memory:":
        return

    Path(db_path).parent.mkdir(parents=True, exist_ok=True)


def run_migrations_offline() -> None:
    _ensure_sqlite_parent(str(settings.database_url))
    context.configure(
        url=str(settings.database_url),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    _ensure_sqlite_parent(str(settings.database_url))
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
