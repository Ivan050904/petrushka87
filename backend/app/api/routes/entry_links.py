from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.entry_links import (
    create_link,
    delete_link,
    list_links_for_entry,
    migrate_metadata_links_for_user,
)

router = APIRouter()


class EntryLinkCreate(BaseModel):
    target_entry_id: uuid.UUID
    link_type: str = Field(min_length=1, max_length=32)


class EntryLinkRead(BaseModel):
    id: uuid.UUID
    source_entry_id: uuid.UUID
    target_entry_id: uuid.UUID
    link_type: str


@router.get("/{entry_id}/links", response_model=list[EntryLinkRead])
def get_entry_links(
    entry_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EntryLinkRead]:
    migrate_metadata_links_for_user(db, current_user.id)
    db.commit()
    links = list_links_for_entry(db, user_id=current_user.id, entry_id=entry_id)
    return [
        EntryLinkRead(
            id=link.id,
            source_entry_id=link.source_entry_id,
            target_entry_id=link.target_entry_id,
            link_type=link.link_type,
        )
        for link in links
    ]


@router.post("/{entry_id}/links", response_model=EntryLinkRead, status_code=status.HTTP_201_CREATED)
def post_entry_link(
    entry_id: uuid.UUID,
    payload: EntryLinkCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EntryLinkRead:
    try:
        link = create_link(
            db,
            user_id=current_user.id,
            source_entry_id=entry_id,
            target_entry_id=payload.target_entry_id,
            link_type=payload.link_type,
        )
        db.commit()
        db.refresh(link)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return EntryLinkRead(
        id=link.id,
        source_entry_id=link.source_entry_id,
        target_entry_id=link.target_entry_id,
        link_type=link.link_type,
    )


@router.delete("/{entry_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_entry_link(
    entry_id: uuid.UUID,
    link_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    del entry_id
    if not delete_link(db, user_id=current_user.id, link_id=link_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
