from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import BinaryIO

from app.core.config import settings
from app.storage.base import StoredFile


class LocalFileStorage:
    provider = "local"

    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or settings.local_storage_path)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, file: BinaryIO, filename: str, content_type: str) -> StoredFile:
        stored_filename = Path(filename).name.strip() or "resource"
        key = f"{uuid.uuid4()}-{stored_filename}"
        destination = self.path_for(key)
        with destination.open("wb") as output:
            shutil.copyfileobj(file, output)

        return StoredFile(
            key=key,
            filename=stored_filename,
            content_type=content_type,
            size=destination.stat().st_size,
        )

    def open(self, key: str) -> BinaryIO:
        return self.path_for(key).open("rb")

    def delete(self, key: str) -> None:
        path = self.path_for(key)
        if path.exists():
            path.unlink()

    def path_for(self, key: str) -> Path:
        path = (self.root / key).resolve()
        root = self.root.resolve()
        if root == path or root not in path.parents:
            raise ValueError("Storage key is outside the local storage root")
        return path
