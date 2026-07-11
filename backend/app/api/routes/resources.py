from __future__ import annotations

import uuid
from collections.abc import Iterator
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.serializers import serialize_entry
from app.db.session import get_db
from app.models.entry import Entry
from app.models.user import User
from app.schemas.entry import EntryRead
from app.storage import get_file_storage

router = APIRouter()
storage = get_file_storage()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".md"}


@router.post("", response_model=EntryRead, status_code=status.HTTP_201_CREATED)
def upload_resource(
    title: str = Form(min_length=1, max_length=160),
    description: str = Form(default=""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EntryRead:
    filename = file.filename or "resource"
    extension = _extension(filename)
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Supported file types: PDF, DOCX, PPTX, MD",
        )

    stored_file = storage.save(
        file.file,
        filename=filename,
        content_type=file.content_type or "application/octet-stream",
    )
    entry = Entry(
        user_id=current_user.id,
        type="resource",
        title=title,
        content=description or title,
        metadata_={
            "description": description or None,
            "file": {
                "key": stored_file.key,
                "filename": stored_file.filename,
                "content_type": stored_file.content_type,
                "size": stored_file.size,
                "storage": storage.provider,
            },
        },
    )
    db.add(entry)
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(stored_file.key)
        raise
    db.refresh(entry)
    return serialize_entry(entry)


@router.get("/{entry_id}/file")
def download_resource_file(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    entry = db.get(Entry, entry_id)
    if entry is None or entry.user_id != current_user.id or entry.type != "resource":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

    file_metadata = entry.metadata_.get("file")
    if not isinstance(file_metadata, dict):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File metadata not found")

    key = file_metadata.get("key")
    filename = file_metadata.get("filename") or entry.title
    if not isinstance(key, str):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File key not found")

    try:
        file = storage.open(key)
    except (FileNotFoundError, ValueError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    content_type = str(file_metadata.get("content_type") or "application/octet-stream")
    return StreamingResponse(
        _stream_file(file),
        media_type=content_type,
        headers={"Content-Disposition": _content_disposition(str(filename))},
    )


def _extension(filename: str) -> str:
    dot = filename.rfind(".")
    if dot == -1:
        return ""
    return filename[dot:].lower()


def _stream_file(file) -> Iterator[bytes]:
    with file:
        while chunk := file.read(1024 * 1024):
            yield chunk


def _content_disposition(filename: str) -> str:
    quoted_filename = quote(filename)
    return f"attachment; filename*=UTF-8''{quoted_filename}"
