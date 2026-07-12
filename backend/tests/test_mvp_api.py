from __future__ import annotations

import uuid
from collections.abc import Generator
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes import entries as entry_routes
from app.api.routes import resources
from app.api.routes import tasks as task_routes
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.entry import Entry
from app.models.user import User
from app.services.ai.base import AIUsage, EntryClassification, ParsedTaskCandidate, TaskParseResult
from app.storage.local import LocalFileStorage
from tests.auth_helpers import create_user_token as _register


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )
    _enable_foreign_keys(engine)
    Base.metadata.create_all(bind=engine)

    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    original_storage = resources.storage
    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(entry_routes, "get_ai_client", lambda: None)
    resources.storage = LocalFileStorage(tmp_path / "files")

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        resources.storage = original_storage
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def test_auth_and_entry_crud(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    created = client.post(
        "/api/v1/entries",
        headers=headers,
        json={"type": "note", "content": "Купить молоко"},
    )
    assert created.status_code == 201
    entry = created.json()
    assert entry["type"] == "note"
    assert entry["title"] == "Купить молоко"

    updated = client.patch(
        f"/api/v1/entries/{entry['id']}",
        headers=headers,
        json={"type": "task", "metadata": {"status": "active", "project": "Дом"}},
    )
    assert updated.status_code == 200
    assert updated.json()["type"] == "task"
    assert updated.json()["metadata"]["status"] == "active"
    assert datetime.fromisoformat(updated.json()["updated_at"]) > datetime.fromisoformat(entry["updated_at"])

    listed = client.get("/api/v1/entries", headers=headers, params={"q": "молоко", "type": "task"})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    removed = client.delete(f"/api/v1/entries/{entry['id']}", headers=headers)
    assert removed.status_code == 204


def test_type_change_requires_valid_metadata(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    created = client.post(
        "/api/v1/entries",
        headers=headers,
        json={"type": "note", "content": "Потратил денег"},
    )
    assert created.status_code == 201

    invalid_update = client.patch(
        f"/api/v1/entries/{created.json()['id']}",
        headers=headers,
        json={"type": "finance"},
    )
    assert invalid_update.status_code == 422

    valid_update = client.patch(
        f"/api/v1/entries/{created.json()['id']}",
        headers=headers,
        json={
            "type": "finance",
            "metadata": {
                "amount": 500,
                "direction": "expense",
                "currency": "RUB",
                "description": "кофе",
            },
        },
    )
    assert valid_update.status_code == 200
    assert valid_update.json()["type"] == "finance"


def test_patch_entry_merges_metadata(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    created = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "task",
            "title": "Merged task",
            "content": "Task body",
            "metadata": {
                "status": "active",
                "collection": "inbox",
                "external_id": "task-123",
            },
        },
    )
    assert created.status_code == 201
    entry_id = created.json()["id"]

    updated = client.patch(
        f"/api/v1/entries/{entry_id}",
        headers=headers,
        json={"metadata": {"status": "done"}},
    )
    assert updated.status_code == 200
    metadata = updated.json()["metadata"]
    assert metadata["status"] == "done"
    assert metadata["collection"] == "inbox"
    assert metadata["external_id"] == "task-123"


def test_entry_search_matches_metadata(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    created = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "person",
            "title": "Maxim",
            "content": "Designer",
            "metadata": {
                "full_name": "Maxim Ivanov",
                "description": "Designer",
                "contacts": ["telegram: folio-one-max"],
            },
        },
    )
    assert created.status_code == 201

    listed = client.get("/api/v1/entries", headers=headers, params={"q": "folio-one-max"})

    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == created.json()["id"]


def test_person_contact_items_are_normalized(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    created = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "person",
            "title": "Maria",
            "content": "Designer",
            "metadata": {
                "full_name": "Maria Ivanova",
                "contact_items": [
                    {"type": "telegram", "value": "@masha"},
                    {"type": "email", "value": "masha@studio.ru"},
                ],
            },
        },
    )
    assert created.status_code == 201
    metadata = created.json()["metadata"]
    assert metadata["contact_items"][0]["type"] == "telegram"
    assert "telegram: @masha" in metadata["contacts"]
    assert "email: masha@studio.ru" in metadata["contacts"]


def test_entries_are_isolated_between_users(client: TestClient) -> None:
    owner_token = _register(client)
    other_token = _register(client)
    owner_headers = _auth_headers(owner_token)
    other_headers = _auth_headers(other_token)

    created = client.post(
        "/api/v1/entries",
        headers=owner_headers,
        json={"type": "note", "title": "Private", "content": "private-marker-42"},
    )
    assert created.status_code == 201
    entry_id = created.json()["id"]

    other_list = client.get(
        "/api/v1/entries",
        headers=other_headers,
        params={"q": "private-marker-42"},
    )
    assert other_list.status_code == 200
    assert other_list.json()["total"] == 0

    other_read = client.get(f"/api/v1/entries/{entry_id}", headers=other_headers)
    assert other_read.status_code == 404

    other_update = client.patch(
        f"/api/v1/entries/{entry_id}",
        headers=other_headers,
        json={"content": "changed by someone else"},
    )
    assert other_update.status_code == 404

    other_delete = client.delete(f"/api/v1/entries/{entry_id}", headers=other_headers)
    assert other_delete.status_code == 404

    owner_read = client.get(f"/api/v1/entries/{entry_id}", headers=owner_headers)
    assert owner_read.status_code == 200
    assert owner_read.json()["content"] == "private-marker-42"


def test_task_parent_must_be_existing_owned_task(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    parent = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "task",
            "title": "Parent",
            "content": "Parent",
            "metadata": {"status": "active"},
        },
    )
    assert parent.status_code == 201
    parent_id = parent.json()["id"]

    child = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "task",
            "title": "Child",
            "content": "Child",
            "metadata": {"status": "active", "parent_id": parent_id},
        },
    )
    assert child.status_code == 201
    assert child.json()["metadata"]["parent_id"] == parent_id
    child_id = child.json()["id"]

    note = client.post(
        "/api/v1/entries",
        headers=headers,
        json={"type": "note", "title": "Not a task", "content": "Not a task"},
    )
    assert note.status_code == 201

    invalid_non_task_parent = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "task",
            "title": "Invalid parent",
            "content": "Invalid parent",
            "metadata": {"status": "active", "parent_id": note.json()["id"]},
        },
    )
    assert invalid_non_task_parent.status_code == 422

    invalid_missing_parent = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "task",
            "title": "Missing parent",
            "content": "Missing parent",
            "metadata": {"status": "active", "parent_id": str(uuid.uuid4())},
        },
    )
    assert invalid_missing_parent.status_code == 422

    self_parent = client.patch(
        f"/api/v1/entries/{parent_id}",
        headers=headers,
        json={"metadata": {"status": "active", "parent_id": parent_id}},
    )
    assert self_parent.status_code == 422

    cyclic_parent = client.patch(
        f"/api/v1/entries/{parent_id}",
        headers=headers,
        json={"metadata": {"status": "active", "parent_id": child_id}},
    )
    assert cyclic_parent.status_code == 422

    deleted_parent = client.delete(f"/api/v1/entries/{parent_id}", headers=headers)
    assert deleted_parent.status_code == 204

    child_after_parent_delete = client.get(f"/api/v1/entries/{child_id}", headers=headers)
    assert child_after_parent_delete.status_code == 200
    assert child_after_parent_delete.json()["metadata"]["parent_id"] is None


def test_task_parent_must_belong_to_current_user(client: TestClient) -> None:
    owner_token = _register(client)
    other_token = _register(client)

    other_parent = client.post(
        "/api/v1/entries",
        headers=_auth_headers(other_token),
        json={
            "type": "task",
            "title": "Other parent",
            "content": "Other parent",
            "metadata": {"status": "active"},
        },
    )
    assert other_parent.status_code == 201

    child = client.post(
        "/api/v1/entries",
        headers=_auth_headers(owner_token),
        json={
            "type": "task",
            "title": "Invalid cross-user child",
            "content": "Invalid cross-user child",
            "metadata": {"status": "active", "parent_id": other_parent.json()["id"]},
        },
    )

    assert child.status_code == 422


def test_recent_lists_follow_updated_at(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    first = client.post(
        "/api/v1/entries",
        headers=headers,
        json={"type": "note", "title": "First", "content": "First note"},
    )
    assert first.status_code == 201

    second = client.post(
        "/api/v1/entries",
        headers=headers,
        json={"type": "note", "title": "Second", "content": "Second note"},
    )
    assert second.status_code == 201

    updated_first = client.patch(
        f"/api/v1/entries/{first.json()['id']}",
        headers=headers,
        json={"content": "First note updated"},
    )
    assert updated_first.status_code == 200

    listed = client.get("/api/v1/entries", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["items"][0]["id"] == first.json()["id"]

    dashboard = client.get("/api/v1/dashboard", headers=headers)
    assert dashboard.status_code == 200
    assert dashboard.json()["latest_entries"][0]["id"] == first.json()["id"]


def test_typed_metadata_rejects_invalid_dates(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    invalid_task = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "task",
            "title": "Bad deadline",
            "content": "Bad deadline",
            "metadata": {"status": "active", "deadline": "2026-02-31T10:00"},
        },
    )
    assert invalid_task.status_code == 422

    valid_task = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "task",
            "title": "Valid deadline",
            "content": "Valid deadline",
            "metadata": {"status": "active", "deadline": "2026-06-11T10:00"},
        },
    )
    assert valid_task.status_code == 201
    assert valid_task.json()["metadata"]["deadline"] == "2026-06-11T10:00"

    invalid_person = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "person",
            "title": "Person",
            "content": "Person",
            "metadata": {"full_name": "Person", "birthday": "2026-13-01"},
        },
    )
    assert invalid_person.status_code == 422

    invalid_diary = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "diary",
            "title": "Bad diary date",
            "content": "Bad diary date",
            "metadata": {"entry_date": "2026-02-31"},
        },
    )
    assert invalid_diary.status_code == 422


def test_event_metadata_is_normalized_and_validated(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    created = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "event",
            "title": "Python Conf",
            "content": "Python Conf",
            "metadata": {
                "starts_at": "2026-06-20T10:00",
                "ends_at": "2026-06-20T18:00",
                "location": "Online",
                "linked_entry_ids": [],
            },
        },
    )
    assert created.status_code == 201
    metadata = created.json()["metadata"]
    assert metadata["starts_at"] == "2026-06-20T10:00"
    assert metadata["ends_at"] == "2026-06-20T18:00"
    assert metadata["status"] == "tracking"

    invalid_start = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "event",
            "title": "Broken event",
            "content": "Broken event",
            "metadata": {"starts_at": "2026-02-31T10:00"},
        },
    )
    assert invalid_start.status_code == 422

    invalid_range = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "event",
            "title": "Backwards event",
            "content": "Backwards event",
            "metadata": {"starts_at": "2026-06-20T18:00", "ends_at": "2026-06-20T10:00"},
        },
    )
    assert invalid_range.status_code == 422


def test_diary_metadata_is_normalized_and_validated(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    created = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "diary",
            "title": "Daily log",
            "content": "Today was focused.",
            "metadata": {"entry_date": "2026-06-11", "mood": "focused"},
        },
    )

    assert created.status_code == 201
    metadata = created.json()["metadata"]
    assert metadata["mode"] == "diary"
    assert metadata["entry_date"] == "2026-06-11"
    assert metadata["mood"] == "focused"

    invalid = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "diary",
            "title": "Bad date",
            "content": "Wrong date format.",
            "metadata": {"entry_date": "11.06.2026"},
        },
    )

    assert invalid.status_code == 422

    defaulted = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "diary",
            "title": "No date",
            "content": "Diary entry without explicit date.",
            "metadata": {},
        },
    )

    assert defaulted.status_code == 201
    date.fromisoformat(defaulted.json()["metadata"]["entry_date"])


def test_habit_metadata_is_normalized_and_validated(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    defaulted = client.post(
        "/api/v1/entries",
        headers=headers,
        json={"type": "habit", "title": "Read", "content": "Read"},
    )
    assert defaulted.status_code == 201
    metadata = defaulted.json()["metadata"]
    assert metadata["stage"] == "desired"
    assert metadata["regularity"]["kind"] == "daily"
    assert metadata["logs"] == {}

    weekdays = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "habit",
            "title": "Training",
            "content": "Training",
            "metadata": {
                "stage": "tracking",
                "regularity": {"kind": "weekdays", "weekdays": [5, 1, 1]},
                "logs": {"2026-06-01": "done", "2026-06-02": "skip", "2026-06-03": "rest"},
            },
        },
    )
    assert weekdays.status_code == 201
    assert weekdays.json()["metadata"]["regularity"]["weekdays"] == [1, 5]

    listed = client.get("/api/v1/entries", headers=headers, params={"type": "habit"})
    assert listed.status_code == 200
    assert listed.json()["total"] == 2

    invalid_payloads = [
        {"regularity": {"kind": "weekdays", "weekdays": []}},
        {"regularity": {"kind": "weekdays", "weekdays": [0]}},
        {"regularity": {"kind": "weekly_target", "target": 8}},
        {"regularity": {"kind": "monthly_target", "target": 32}},
        {"logs": {"2026-02-31": "done"}},
        {"logs": {"2026-06-01": "missed"}},
    ]

    for metadata in invalid_payloads:
        invalid = client.post(
            "/api/v1/entries",
            headers=headers,
            json={
                "type": "habit",
                "title": "Invalid habit",
                "content": "Invalid habit",
                "metadata": metadata,
            },
        )
        assert invalid.status_code == 422


def test_dashboard_returns_daily_summary(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    payloads = [
        {"type": "note", "content": "Daily note"},
        {
            "type": "task",
            "title": "Active task",
            "content": "Active task",
            "metadata": {"status": "active"},
        },
        {
            "type": "task",
            "title": "Done task",
            "content": "Done task",
            "metadata": {"status": "done"},
        },
        {
            "type": "task",
            "title": "Inbox task",
            "content": "Inbox task",
            "metadata": {"status": "inbox"},
        },
        {
            "type": "finance",
            "title": "Coffee",
            "content": "Coffee",
            "metadata": {
                "amount": 250,
                "direction": "expense",
                "currency": "RUB",
                "description": "Coffee",
            },
        },
        {
            "type": "finance",
            "title": "Salary",
            "content": "Salary",
            "metadata": {
                "amount": 1000,
                "direction": "income",
                "currency": "RUB",
                "description": "Salary",
            },
        },
    ]

    for payload in payloads:
        created = client.post("/api/v1/entries", headers=headers, json=payload)
        assert created.status_code == 201

    dashboard = client.get("/api/v1/dashboard", headers=headers)

    assert dashboard.status_code == 200
    body = dashboard.json()
    assert body["total_entries"] == 6
    assert body["active_task_count"] == 1
    assert body["recent_expense_count"] == 1
    assert len(body["latest_entries"]) == 6
    assert [entry["title"] for entry in body["active_tasks"]] == ["Active task"]
    assert [entry["title"] for entry in body["recent_expenses"]] == ["Coffee"]
    assert [entry["title"] for entry in body["recent_notes"]] == ["Daily note"]


def test_resource_upload_and_download(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    uploaded = client.post(
        "/api/v1/resources",
        headers=headers,
        data={"title": "Readme", "description": "Project notes"},
        files={"file": ("../notes.md", b"# Folio-One\n", "text/markdown")},
    )
    assert uploaded.status_code == 201
    resource = uploaded.json()
    assert resource["type"] == "resource"
    assert resource["metadata"]["file"]["filename"] == "notes.md"
    assert resource["metadata"]["file"]["size"] == 12
    assert resource["metadata"]["file"]["storage"] == "local"
    stored_path = resources.storage.path_for(resource["metadata"]["file"]["key"])
    assert stored_path.exists()

    invalid_metadata = client.patch(
        f"/api/v1/entries/{resource['id']}",
        headers=headers,
        json={
            "type": "resource",
            "metadata": {
                **resource["metadata"],
                "file": {**resource["metadata"]["file"], "size": -1},
            },
        },
    )
    assert invalid_metadata.status_code == 422

    renamed = client.patch(
        f"/api/v1/entries/{resource['id']}",
        headers=headers,
        json={
            "type": "resource",
            "title": "Project readme",
            "content": "Updated notes",
            "metadata": {**resource["metadata"], "description": "Updated notes"},
        },
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Project readme"

    downloaded = client.get(f"/api/v1/resources/{resource['id']}/file", headers=headers)
    assert downloaded.status_code == 200
    assert downloaded.content == b"# Folio-One\n"

    removed = client.delete(f"/api/v1/entries/{resource['id']}", headers=headers)
    assert removed.status_code == 204
    assert not stored_path.exists()


def test_resource_upload_removes_file_when_commit_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FailingDb:
        rolled_back = False

        def add(self, entry: Entry) -> None:
            self.entry = entry

        def commit(self) -> None:
            raise RuntimeError("commit failed")

        def rollback(self) -> None:
            self.rolled_back = True

        def refresh(self, entry: Entry) -> None:
            raise AssertionError("refresh should not run after a failed commit")

    storage = LocalFileStorage(tmp_path / "files")
    monkeypatch.setattr(resources, "storage", storage)
    db = FailingDb()
    upload = SimpleNamespace(
        filename="orphan.md",
        content_type="text/markdown",
        file=BytesIO(b"# Orphan\n"),
    )
    user = User(id=uuid.uuid4(), email="resource-owner@example.com", hashed_password="hash")

    with pytest.raises(RuntimeError, match="commit failed"):
        resources.upload_resource(
            title="Orphan",
            description="Should be deleted",
            file=upload,
            db=db,  # type: ignore[arg-type]
            current_user=user,
        )

    assert db.rolled_back is True
    assert list((tmp_path / "files").iterdir()) == []


def test_resource_file_is_removed_when_entry_changes_type(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    uploaded = client.post(
        "/api/v1/resources",
        headers=headers,
        data={"title": "Temporary resource", "description": "Will become note"},
        files={"file": ("temporary.md", b"# Temporary\n", "text/markdown")},
    )
    assert uploaded.status_code == 201
    resource = uploaded.json()
    stored_path = resources.storage.path_for(resource["metadata"]["file"]["key"])
    assert stored_path.exists()

    changed = client.patch(
        f"/api/v1/entries/{resource['id']}",
        headers=headers,
        json={
            "type": "note",
            "title": "Temporary note",
            "content": "Now it is a note.",
            "metadata": {"source": "manual"},
        },
    )

    assert changed.status_code == 200
    assert changed.json()["type"] == "note"
    assert not stored_path.exists()

    downloaded = client.get(f"/api/v1/resources/{resource['id']}/file", headers=headers)
    assert downloaded.status_code == 404


def test_resource_file_is_removed_when_file_metadata_is_removed(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    uploaded = client.post(
        "/api/v1/resources",
        headers=headers,
        data={"title": "Detached resource", "description": "File will be detached"},
        files={"file": ("detached.md", b"# Detached\n", "text/markdown")},
    )
    assert uploaded.status_code == 201
    resource = uploaded.json()
    stored_path = resources.storage.path_for(resource["metadata"]["file"]["key"])
    assert stored_path.exists()

    updated = client.patch(
        f"/api/v1/entries/{resource['id']}",
        headers=headers,
        json={
            "type": "resource",
            "title": resource["title"],
            "content": resource["content"],
            "metadata": {"description": "Detached from file", "file": None},
        },
    )

    assert updated.status_code == 200
    assert updated.json()["type"] == "resource"
    assert "file" not in updated.json()["metadata"]
    assert not stored_path.exists()

    downloaded = client.get(f"/api/v1/resources/{resource['id']}/file", headers=headers)
    assert downloaded.status_code == 404


def test_ai_classification_can_promote_note_to_typed_entry(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAIClient:
        def classify_entry(self, content: str) -> EntryClassification:
            return EntryClassification(
                type="finance",
                title="Кофе",
                metadata={
                    "amount": 500,
                    "direction": "expense",
                    "currency": "RUB",
                    "description": "кофе",
                },
                confidence=0.91,
                usage=AIUsage(
                    provider="test",
                    model="fake-model",
                    input_tokens=100,
                    output_tokens=20,
                    total_tokens=120,
                    billable_input_tokens=100,
                    cost_rub=0.014,
                    input_cost_rub=0.01,
                    output_cost_rub=0.004,
                    pricing={"input": 0.1, "output": 0.2},
                    pricing_note="test pricing",
                ),
            )

    monkeypatch.setattr(entry_routes, "get_ai_client", lambda: FakeAIClient())
    token = _register(client)

    created = client.post(
        "/api/v1/entries",
        headers=_auth_headers(token),
        json={"type": "note", "content": "Потратил 500 рублей на кофе"},
    )

    assert created.status_code == 201
    entry = created.json()
    assert entry["type"] == "finance"
    assert entry["title"] == "Кофе"
    assert entry["metadata"]["amount"] == 500
    assert entry["metadata"]["ai"]["classification"]["type"] == "finance"
    assert entry["metadata"]["ai"]["usage"]["provider"] == "test"
    assert entry["metadata"]["ai"]["usage"]["cost_rub"] == 0.014
    assert entry["metadata"]["ai"]["usage"]["input_tokens"] == 100
    assert entry["metadata"]["ai"]["usage"]["output_tokens"] == 20


def test_ai_classification_defaults_diary_date(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAIClient:
        def classify_entry(self, content: str) -> EntryClassification:
            return EntryClassification(
                type="diary",
                title="Reflection",
                metadata={},
                confidence=0.88,
            )

    monkeypatch.setattr(entry_routes, "get_ai_client", lambda: FakeAIClient())
    token = _register(client)

    created = client.post(
        "/api/v1/entries",
        headers=_auth_headers(token),
        json={"type": "note", "content": "Today felt focused."},
    )

    assert created.status_code == 201
    entry = created.json()
    assert entry["type"] == "diary"
    date.fromisoformat(entry["metadata"]["entry_date"])
    assert entry["metadata"]["ai"]["classification"]["type"] == "diary"


def test_ai_classification_can_promote_note_to_event(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAIClient:
        def classify_entry(self, content: str) -> EntryClassification:
            return EntryClassification(
                type="event",
                title="Python Conf",
                metadata={
                    "starts_at": "2026-06-20T10:00",
                    "ends_at": "2026-06-20T18:00",
                    "location": "Online",
                },
                confidence=0.9,
            )

    monkeypatch.setattr(entry_routes, "get_ai_client", lambda: FakeAIClient())
    token = _register(client)

    created = client.post(
        "/api/v1/entries",
        headers=_auth_headers(token),
        json={"type": "note", "content": "Track Python Conf on June 20"},
    )

    assert created.status_code == 201
    entry = created.json()
    assert entry["type"] == "event"
    assert entry["metadata"]["starts_at"] == "2026-06-20T10:00"
    assert entry["metadata"]["ai"]["classification"]["type"] == "event"


def test_ai_classification_falls_back_when_task_parent_is_invalid(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAIClient:
        def classify_entry(self, content: str) -> EntryClassification:
            return EntryClassification(
                type="task",
                title="Child task",
                metadata={"status": "active", "parent_id": str(uuid.uuid4())},
                confidence=0.9,
            )

    monkeypatch.setattr(entry_routes, "get_ai_client", lambda: FakeAIClient())
    token = _register(client)

    created = client.post(
        "/api/v1/entries",
        headers=_auth_headers(token),
        json={"type": "note", "content": "Do the child task"},
    )

    assert created.status_code == 201
    entry = created.json()
    assert entry["type"] == "note"
    assert entry["metadata"]["ai"]["classification_error"] == "HTTPException"


def test_ai_classification_falls_back_to_note_when_metadata_is_invalid(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAIClient:
        def classify_entry(self, content: str) -> EntryClassification:
            return EntryClassification(
                type="finance",
                title="Расход",
                metadata={},
                confidence=0.8,
                usage=AIUsage(
                    provider="test",
                    model="fake-model",
                    input_tokens=80,
                    output_tokens=10,
                    total_tokens=90,
                    billable_input_tokens=80,
                    cost_rub=0.01,
                ),
            )

    monkeypatch.setattr(entry_routes, "get_ai_client", lambda: FakeAIClient())
    token = _register(client)

    created = client.post(
        "/api/v1/entries",
        headers=_auth_headers(token),
        json={"type": "note", "content": "Потратил денег"},
    )

    assert created.status_code == 201
    entry = created.json()
    assert entry["type"] == "note"
    assert entry["metadata"]["ai"]["classification_error"] == "ValidationError"
    assert entry["metadata"]["ai"]["usage"]["cost_rub"] == 0.01


def test_task_ai_parse_endpoint_returns_task_candidates(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAIClient:
        def classify_entry(self, content: str) -> EntryClassification:
            raise AssertionError("classification should not be used")

        def parse_tasks(self, content: str) -> TaskParseResult:
            assert "созвон" in content
            return TaskParseResult(
                tasks=[
                    ParsedTaskCandidate(
                        title="Созвон с Иваном",
                        deadline="2026-06-20T12:00",
                        priority="high",
                        tags=["работа"],
                        confidence=0.93,
                    )
                ]
            )

    monkeypatch.setattr(task_routes, "get_ai_client", lambda: FakeAIClient())
    token = _register(client)

    parsed = client.post(
        "/api/v1/tasks/parse",
        headers=_auth_headers(token),
        json={"content": "важный созвон с Иваном до 2026-06-20 #работа"},
    )

    assert parsed.status_code == 200
    body = parsed.json()
    assert body["tasks"][0]["title"] == "Созвон с Иваном"
    assert body["tasks"][0]["deadline"] == "2026-06-20T12:00"
    assert body["tasks"][0]["priority"] == "high"




def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _enable_foreign_keys(engine: Engine) -> None:
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection: object, connection_record: object) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
