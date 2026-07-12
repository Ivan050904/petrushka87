from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.finance_demo_seed import run_finance_demo_seed  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create or refresh the finance demo user with real finance data and workout history.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing finance demo data and seed again.",
    )
    parser.add_argument(
        "--synthetic",
        action="store_true",
        help="Use generated finance data instead of copying from petr@petr.local.",
    )
    parser.add_argument(
        "--no-workouts",
        action="store_true",
        help="Skip workout session seeding.",
    )
    parser.add_argument(
        "--july-through-day",
        type=int,
        default=12,
        help="For synthetic mode only: generate July transactions through this day.",
    )
    args = parser.parse_args()

    result = run_finance_demo_seed(
        reset=args.reset,
        july_through_day=args.july_through_day,
        from_petr=not args.synthetic,
        with_workouts=not args.no_workouts,
    )

    if result.skipped:
        print(
            f"Finance demo user already seeded ({result.finance_entries} finance entries). "
            "Use --reset to recreate data."
        )
    else:
        action = "created" if result.created_user else "updated"
        print(f"Finance demo user {action}: {result.email}")
        print(f"Password: {result.password}")
        print(f"Finance entries copied: {result.finance_entries}")
        print(f"Finance categories: {result.category_count}")
        print(f"Workout sessions: {result.workout_sessions}")
        print("Finance: /tracking?tab=finance&financeView=dashboard")
        print("Gym: /tracking?tab=workouts")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
