from __future__ import annotations

from app.core.config import settings
from app.storage.base import FileStorage
from app.storage.local import LocalFileStorage
from app.storage.s3 import S3FileStorage


def get_file_storage(provider: str | None = None) -> FileStorage:
    selected_provider = provider or settings.file_storage_provider
    if selected_provider == "local":
        return LocalFileStorage()
    if selected_provider == "s3":
        return S3FileStorage()
    raise RuntimeError(f"Unsupported file storage provider: {selected_provider}")
