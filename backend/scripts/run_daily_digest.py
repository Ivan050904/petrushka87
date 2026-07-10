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
    parser = argparse.ArgumentParser(description="Run the Folio-One daily article digest.")
    parser.add_argument(
        "--email",
        default=None,
        help="User email to save articles for (defaults to DIGEST_USER_EMAIL).",
    )
    parser.add_argument(
        "--topics",
        default=None,
        help="Comma-separated search topics (defaults to DIGEST_TOPICS).",
    )
    parser.add_argument(
        "--max-articles",
        type=int,
        default=None,
        help="Maximum number of articles to save.",
    )
    parser.add_argument(
        "--skip-health-check",
        action="store_true",
        help="Skip Ollama health check before running.",
    )
    args = parser.parse_args()

    _configure_logging()
    logger = logging.getLogger("digest")

    topics = [item.strip() for item in args.topics.split(",") if item.strip()] if args.topics else None
    db = SessionLocal()
    try:
        result = run_daily_digest(
            db,
            user_email=args.email,
            topics=topics,
            max_articles=args.max_articles,
            skip_health_check=args.skip_health_check,
        )
        logger.info(
            "Digest finished: status=%s saved=%s skipped=%s message=%s",
            result.status,
            result.articles_saved,
            result.articles_skipped,
            result.message,
        )
        return 0 if result.status in {"ok", "empty", "disabled"} else 1
    except Exception:
        logger.exception("Digest failed")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
