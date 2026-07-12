from __future__ import annotations

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
