from __future__ import annotations

import uuid
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from app.core.config import settings
from app.storage.base import StoredFile


class S3FileStorage:
    provider = "s3"

    def __init__(self) -> None:
        if not settings.s3_bucket_name:
            raise RuntimeError("S3 storage requires S3_BUCKET_NAME")

        try:
            import boto3
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "S3 storage requires boto3. "
                "Install the backend s3 extra before using FILE_STORAGE_PROVIDER=s3."
            ) from exc

        self.bucket_name = settings.s3_bucket_name
        self.prefix = settings.s3_prefix.strip("/")
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            region_name=settings.s3_region or None,
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
        )

    def save(self, file: BinaryIO, filename: str, content_type: str) -> StoredFile:
        stored_filename = Path(filename).name.strip() or "resource"
        body, size = _read_file(file)
        key = self._key_for(stored_filename)
        extra_args = {"ContentType": content_type or "application/octet-stream"}

        self.client.upload_fileobj(body, self.bucket_name, key, ExtraArgs=extra_args)
        return StoredFile(
            key=key,
            filename=stored_filename,
            content_type=extra_args["ContentType"],
            size=size,
        )

    def open(self, key: str) -> BinaryIO:
        response = self.client.get_object(Bucket=self.bucket_name, Key=key)
        return response["Body"]

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket_name, Key=key)

    def _key_for(self, filename: str) -> str:
        key = f"{uuid.uuid4()}-{filename}"
        return f"{self.prefix}/{key}" if self.prefix else key


def _read_file(file: BinaryIO) -> tuple[BinaryIO, int]:
    data = file.read()
    return BytesIO(data), len(data)
