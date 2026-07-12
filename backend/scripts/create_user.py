"""Create a user account directly in the database (registration is disabled via API)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import SessionLocal  # noqa: E402
from app.services.users import UserAlreadyExistsError, create_user  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a Folio-One user in the local database.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--full-name", default=None)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = create_user(
            db,
            email=args.email,
            password=args.password,
            full_name=args.full_name,
        )
    except UserAlreadyExistsError as error:
        print(f"[create_user] error: {error}")
        return 1
    finally:
        db.close()

    print(f"[create_user] created {user.email} ({user.id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
