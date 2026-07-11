"""Bootstrap local database: migrations, demo seed."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings  # noqa: E402
from app.services.demo_seed import run_demo_seed  # noqa: E402


def _run_script(name: str, *args: str) -> None:
    script = BACKEND_ROOT / "scripts" / name
    if not script.exists():
        return
    subprocess.run([sys.executable, str(script), *args], cwd=BACKEND_ROOT, check=False)


def _assert_folio_one_database() -> None:
    url = str(settings.database_url)
    if "folio_one.db" not in url:
        raise SystemExit(
            f"[bootstrap] DATABASE_URL must point to folio_one.db, got: {url}",
        )


def main() -> int:
    _assert_folio_one_database()

    print("[bootstrap] alembic upgrade head")
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        check=False,
    )
    if result.returncode != 0:
        print("[bootstrap] warn: migrations failed")

    print("[bootstrap] cleaning orphan storage files")
    _run_script("clean_orphan_files.py")

    seed = run_demo_seed(reset=False)
    if seed.skipped:
        print(f"[bootstrap] demo user already present ({seed.entries_total} entries)")
    else:
        print(f"[bootstrap] demo seeded: {seed.entries_created} entries")

    print("[bootstrap] done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
