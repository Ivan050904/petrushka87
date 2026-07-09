from __future__ import annotations

import sys
from io import BytesIO
from types import SimpleNamespace

import pytest

from app.storage import s3 as s3_storage
from app.storage.factory import get_file_storage
from app.storage.local import LocalFileStorage


def test_get_file_storage_returns_local_storage() -> None:
    storage = get_file_storage("local")

    assert isinstance(storage, LocalFileStorage)
    assert storage.provider == "local"


def test_get_file_storage_rejects_unknown_provider() -> None:
    with pytest.raises(RuntimeError, match="Unsupported file storage provider"):
        get_file_storage("ftp")


def test_get_file_storage_returns_s3_storage_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_client = FakeS3Client()

    monkeypatch.setitem(sys.modules, "boto3", SimpleNamespace(client=lambda *_, **__: fake_client))
    monkeypatch.setattr(
        s3_storage,
        "settings",
        SimpleNamespace(
            s3_bucket_name="letscore-test",
            s3_prefix="uploads",
            s3_endpoint_url="",
            s3_region="",
            s3_access_key_id="",
            s3_secret_access_key="",
        ),
    )

    storage = get_file_storage("s3")
    stored_file = storage.save(BytesIO(b"hello"), filename="../notes.md", content_type="text/markdown")

    assert isinstance(storage, s3_storage.S3FileStorage)
    assert storage.provider == "s3"
    assert stored_file.filename == "notes.md"
    assert stored_file.content_type == "text/markdown"
    assert stored_file.size == 5
    assert stored_file.key.startswith("uploads/")
    assert fake_client.uploaded["bucket"] == "letscore-test"
    assert fake_client.uploaded["body"] == b"hello"


def test_s3_storage_requires_bucket_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(s3_storage, "settings", SimpleNamespace(s3_bucket_name=""))

    with pytest.raises(RuntimeError, match="S3_BUCKET_NAME"):
        s3_storage.S3FileStorage()


def test_local_storage_sanitizes_original_filename(tmp_path) -> None:
    storage = LocalFileStorage(tmp_path)

    stored_file = storage.save(BytesIO(b"hello"), filename="../notes.md", content_type="text/markdown")

    assert stored_file.filename == "notes.md"
    assert storage.path_for(stored_file.key).read_bytes() == b"hello"


def test_local_storage_rejects_keys_outside_root(tmp_path) -> None:
    storage = LocalFileStorage(tmp_path)

    for key in ["", ".", "..", "../outside.md"]:
        with pytest.raises(ValueError):
            storage.path_for(key)


class FakeS3Client:
    def __init__(self) -> None:
        self.uploaded: dict[str, object] = {}

    def upload_fileobj(
        self,
        body: BytesIO,
        bucket: str,
        key: str,
        *,
        ExtraArgs: dict[str, str],
    ) -> None:
        self.uploaded = {
            "body": body.read(),
            "bucket": bucket,
            "key": key,
            "extra_args": ExtraArgs,
        }
