from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import SessionLocal  # noqa: E402
from app.services.agent.digest import run_daily_digest  # noqa: E402


def _configure_logging() -> None:
    log_dir = BACKEND_ROOT / "storage" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "digest.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run digest once the same way the built-in scheduler does at 8:00.",
    )
    parser.add_argument(
        "--email",
        default=None,
        help="User email to save articles for (defaults to DIGEST_USER_EMAIL).",
    )
    args = parser.parse_args()

    _configure_logging()
    logger = logging.getLogger("digest.scheduler-test")
    logger.info("Manual scheduler test run started")

    db = SessionLocal()
    try:
        result = run_daily_digest(db, user_email=args.email)
        logger.info(
            "Scheduler test finished: status=%s saved=%s skipped=%s message=%s",
            result.status,
            result.articles_saved,
            result.articles_skipped,
            result.message,
        )
        return 0 if result.status in {"ok", "empty", "up_to_date", "disabled"} else 1
    except Exception:
        logger.exception("Scheduler test failed")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
