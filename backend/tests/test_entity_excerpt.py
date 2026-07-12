from __future__ import annotations

from app.models.entry import Entry
from app.services.context.entity_excerpt import build_entity_excerpt, entry_matches_terms


def test_entry_matches_terms_rejects_manchester_only() -> None:
    entry = Entry(
        user_id="00000000-0000-0000-0000-000000000001",
        type="diary",
        title="Футбол",
        content="Смотрел ЛЧ, играл Манчестер Сити.",
        metadata_={"entry_date": "2021-05-04"},
    )
    assert not entry_matches_terms(entry, ["Маню", "Маня"])


def test_build_entity_excerpt_finds_surrounding_text() -> None:
    text = "Начало. " + ("x" * 500) + " Маня позвонила. " + ("y" * 500)
    excerpt = build_entity_excerpt(text, ["Маня"], max_chars=200)
    assert "Маня" in excerpt
    assert len(excerpt) <= 200
