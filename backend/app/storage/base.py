from __future__ import annotations

from dataclasses import dataclass
from typing import BinaryIO, Protocol


@dataclass(frozen=True)
class StoredFile:
    key: str
    filename: str
    content_type: str
    size: int


class FileStorage(Protocol):
    provider: str

    def save(self, file: BinaryIO, filename: str, content_type: str) -> StoredFile:
        """Persist a file and return its storage metadata."""

    def open(self, key: str) -> BinaryIO:
        """Open a stored file for reading."""

    def delete(self, key: str) -> None:
        """Delete a stored file if it exists."""
