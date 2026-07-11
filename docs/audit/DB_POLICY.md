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

## Not committed (runtime data)

These paths are gitignored:

| Path | Purpose |
| --- | --- |
| `backend/storage/folio_one.db` | Local database (create via bootstrap) |
| `backend/storage/files/` | Uploaded resource files |
| `backend/storage/logs/` | Agent digest scheduler state |
| `backend/storage/transcription/` | Transcription temp files only (not a separate DB) |

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
