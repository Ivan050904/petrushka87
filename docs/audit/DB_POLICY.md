# Database files in git

Folio-One uses a **single runtime SQLite database** for all app data.

## Canonical database

| Path | Purpose |
| --- | --- |
| `backend/storage/folio_one.db` | Users, entries, workouts, therapy sessions, transcription jobs/chats, assistant sessions, embeddings |

Set in `backend/.env`:

```env
DATABASE_URL=sqlite:///./storage/folio_one.db
```

All application modules (main API, transcription sub-app, workouts, therapy) use this database via SQLAlchemy and Alembic migrations.

## Committed database (dev sync)

`backend/storage/folio_one.db` is tracked in git so the same users and data can move between machines during development.

**Before `git push`:**

1. Stop backend/frontend dev servers (SQLite WAL checkpoint).
2. Ensure `folio_one.db-wal` / `folio_one.db-shm` are **not** staged (gitignored).
3. Keep the repository **private** — the DB contains personal notes, finance, therapy, etc.
4. Do not store real production passwords in the committed DB; use dev-only credentials until deploy.

**Create a new user (registration is disabled via API):**

```powershell
cd backend
python scripts/create_user.py --email user@example.com --password "..." --full-name "Name"
```

Then commit the updated `folio_one.db` if you want that account on other machines.

## Not committed (runtime data)

These paths are gitignored:

| Path | Purpose |
| --- | --- |
| `backend/storage/files/` | Uploaded resource files |
| `backend/storage/logs/` | Agent digest scheduler state |
| `backend/storage/transcription/` | Transcription temp files only (not a separate DB) |
| `*.db-wal`, `*.db-shm` | SQLite WAL sidecar files |

After a fresh clone:

```powershell
cd backend
pip install -e ".[dev]"
python scripts/bootstrap_data.py
```

Or run `start-dev.bat` from the repo root (runs bootstrap automatically).

## Legacy databases (removed)

Do not restore or use:

| Path | Status |
| --- | --- |
| `backend/storage/letscore.db` | Removed — data lives in `folio_one.db` |
| `backend/storage/transcription/jobs.db` | Removed — transcription uses `folio_one.db` |

Migration scripts `migrate_user_db.py` and `migrate_transcription_jobs.py` were deleted.

## Local accounts

See `backend/LOCAL_ACCOUNTS.example.txt`:

- `petr@petr.local` / `petr12345` — primary dev account
- `demo@folio-one.local` / `demo12345` — auto-seeded demo user

## Demo reset

```powershell
cd backend
python scripts/seed_demo.py --reset
python scripts/clean_orphan_files.py
```

Demo reset deletes orphaned files in `storage/files/` tied to removed resource entries.
