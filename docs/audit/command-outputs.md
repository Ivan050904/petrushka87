# Command outputs — reengineering audit 2026-07-11

Environment: Windows 10, Python 3.12 (system), Node 20, repo at commit `1a8c2e4` + large uncommitted working tree.

**Post-remediation update (2026-07-11 evening):** Single DB + P0 fixes applied.

## Git baseline

```
git rev-parse HEAD → 1a8c2e4bb39e9a9ae7b489e987bd1818b686c2f8
git diff --stat → 95+ files changed (large uncommitted working tree)
alembic current → 0007_workout_tables (head)
git rm --cached backend/storage/folio_one.db → staged removal from index (local file retained)
```

## Backend

| Command | Exit | Result |
|---------|------|--------|
| `pip install -e ".[dev]"` | 1 | **FAIL** on Windows: setuptools cannot read `../README.md` outside backend package root (Cyrillic user path) — unchanged |
| `pip install pytest-cov ddgs` | 0 | Manual install for local verification |
| `pytest tests/ -q` | 0 | **PASS** — 134 passed |
| `pytest tests/ -q --cov=app --cov-report=term-missing` | 0 | **PASS** — 73% total coverage on `app/` |

### Previously blocked (now fixed)

- **workouts DELETE 204:** `workouts.py` returns `Response(status_code=204)` — `app.main` imports cleanly.
- **Migration scripts removed:** `migrate_user_db.py`, `migrate_transcription_jobs.py` deleted; bootstrap simplified.

## Frontend

| Command | Exit | Result |
|---------|------|--------|
| `npm run typecheck` | 0 | **PASS** |
| `npm run test` (vitest) | 0 | **PASS** — 104 tests, 6 files |
| `npm run build` | 0 | **PASS** — login page wraps `useSearchParams` in Suspense |
| `npm run test:e2e` | — | Not run (requires servers + Playwright) |

## Hygiene checks

| Check | Result |
|-------|--------|
| `yt_trans/` duplicate | **NOT FOUND** |
| `letscore.db`, `jobs.db` | **NOT FOUND** on disk |
| `backend/storage/folio_one.db` | **Untracked** (removed from git index; gitignored) |
| `python scripts/audit_orphans.py` | **0 orphans** |

## CI expectation vs local

GitHub Actions runs `pip install -e ".[dev]"` on Linux — likely **passes**. Local Windows dev may hit setuptools README path error — document as environment finding (P2).
