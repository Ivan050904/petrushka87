from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.demo_seed import run_demo_seed  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or refresh the Folio-One demo user.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing demo entries and seed again.",
    )
    args = parser.parse_args()

    result = run_demo_seed(reset=args.reset)

    if result.skipped:
        print(
            f"Demo user already seeded ({result.entries_total} entries). "
            "Use --reset to recreate data."
        )
    else:
        action = "created" if result.created_user else "updated"
        print(f"Demo user {action}: {result.email}")
        print(f"Password: {result.password}")
        print(f"Entries added: {result.entries_created} (total: {result.entries_total})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
