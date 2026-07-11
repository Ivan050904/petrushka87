from __future__ import annotations

import re
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.schemas.entry import EntryType
from app.schemas.metadata import normalize_metadata

ArticleFeedbackType = Literal["dislike", "off_topic"]

_STOPWORDS = {
    "about",
    "after",
    "agent",
    "agents",
    "article",
    "articles",
    "from",
    "habr",
    "https",
    "into",
    "that",
    "this",
    "with",
    "как",
    "или",
    "для",
    "что",
    "это",
    "про",
    "при",
    "над",
    "под",
    "без",
    "все",
    "всех",
    "статья",
    "статьи",
}


@dataclass(frozen=True)
class FeedbackExample:
    title: str
    summary: str
    url: str
    query: str | None
    feedback: ArticleFeedbackType


@dataclass
class FeedbackProfile:
    blocked_urls: set[str] = field(default_factory=set)
    examples: list[FeedbackExample] = field(default_factory=list)
    negative_themes: list[str] = field(default_factory=list)


def _is_article_entry(entry: Entry) -> bool:
    if entry.type != EntryType.resource.value:
        return False
    return entry.metadata_.get("kind") == "article"


def _extract_negative_themes(examples: list[FeedbackExample], *, limit: int = 10) -> list[str]:
    counter: Counter[str] = Counter()
    for example in examples:
        if example.feedback != "off_topic":
            continue
        haystack = f"{example.title} {example.summary}".lower()
        for token in re.findall(r"[a-zA-Zа-яА-ЯёЁ0-9-]{5,}", haystack):
            lowered = token.lower()
            if lowered in _STOPWORDS:
                continue
            counter[lowered] += 1
    return [token for token, _count in counter.most_common(limit)]


def load_feedback_profile(
    db: Session,
    user_id: uuid.UUID,
    *,
    collection: str | None = None,
    limit: int = 30,
) -> FeedbackProfile:
    rows = db.scalars(
        select(Entry)
        .where(
            Entry.user_id == user_id,
            Entry.type == EntryType.resource.value,
            func.json_extract(Entry.metadata_, "$.kind") == "article",
            func.coalesce(func.json_extract(Entry.metadata_, "$.article_feedback"), "").in_(
                ["dislike", "off_topic"]
            ),
        )
        .order_by(func.coalesce(func.json_extract(Entry.metadata_, "$.feedback_at"), Entry.updated_at).desc())
        .limit(limit * 3)
    ).all()

    examples: list[FeedbackExample] = []
    blocked_urls: set[str] = set()
    for row in rows:
        metadata = row.metadata_
        if collection:
            row_collection = metadata.get("collection")
            if row_collection != collection:
                if collection == "ai" and row_collection not in (None, "ai"):
                    continue
                if collection == "psychology" and row_collection != "psychology":
                    continue
        url = metadata.get("url")
        feedback = metadata.get("article_feedback")
        if not isinstance(url, str) or not url.strip():
            continue
        if feedback not in {"dislike", "off_topic"}:
            continue
        blocked_urls.add(url.strip())
        examples.append(
            FeedbackExample(
                title=row.title,
                summary=str(metadata.get("summary_ru") or row.content or row.title),
                url=url.strip(),
                query=metadata.get("query") if isinstance(metadata.get("query"), str) else None,
                feedback=feedback,
            )
        )
        if len(examples) >= limit:
            break

    return FeedbackProfile(
        blocked_urls=blocked_urls,
        examples=examples,
        negative_themes=_extract_negative_themes(examples),
    )


def apply_article_feedback(
    db: Session,
    *,
    user_id: uuid.UUID,
    entry_id: uuid.UUID,
    feedback: ArticleFeedbackType,
) -> Entry:
    entry = db.get(Entry, entry_id)
    if entry is None or entry.user_id != user_id or not _is_article_entry(entry):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")

    metadata = dict(entry.metadata_)
    metadata["article_hidden"] = True
    metadata["article_feedback"] = feedback
    metadata["feedback_at"] = datetime.now(UTC).isoformat()
    entry.metadata_ = normalize_metadata(EntryType.resource, metadata)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def candidate_matches_negative_themes(candidate_text: str, themes: list[str]) -> bool:
    lowered = candidate_text.lower()
    return any(theme and theme in lowered for theme in themes)
