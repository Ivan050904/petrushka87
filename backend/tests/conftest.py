from __future__ import annotations

import os

# Must run before importing app modules (settings are cached at import time).
os.environ.setdefault("DIGEST_SCHEDULER_ENABLED", "0")

import warnings

warnings.filterwarnings(
    "ignore",
    message=".*on_event is deprecated.*",
    category=DeprecationWarning,
)

import pytest

from app.core.rate_limit import limiter


@pytest.fixture(autouse=True)
def reset_rate_limits() -> None:
    storage = getattr(limiter, "_storage", None)
    if storage is not None and hasattr(storage, "storage"):
        storage.storage.clear()
    yield
    if storage is not None and hasattr(storage, "storage"):
        storage.storage.clear()
