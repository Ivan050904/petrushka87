# Folio-One — Audit Report (reengineering pass)

**Date:** 2026-07-11 (evening, UTC+10)  
**Commit baseline:** `1a8c2e4bb39e9a9ae7b489e987bd1818b686c2f8`  
**Working tree:** large uncommitted delta (+3400 / −2615 lines, 95 files in diff stat)  
**Scope:** Full monorepo audit (read-only; no product code changes)  
**Alembic head:** `0007_workout_tables`

---

## 1. Executive summary

Folio-One grew significantly since the morning audit on the same date: **workouts module**, **therapy sessions**, **hybrid RAG**, **finance dashboard**, **voice transcription tab**, and **journal removal** are present in the working tree but not fully committed.

**Top findings (post-remediation):**

1. **Resolved — P0 backend tests:** workouts DELETE returns proper 204 Response; **134 pytest pass**, 73% coverage.
2. **Resolved — P0 frontend build:** login page uses Suspense; `npm run build` passes.
3. **Open — P1:** Large uncommitted surface (~95 changed files); split into PRs recommended.
4. **Resolved — P2 DB policy:** single `folio_one.db`; legacy letscore/jobs.db removed; DB untracked in git.
5. **Open — P2:** Finance dual parsers (frontend real, backend stubs).
6. **Resolved since prior audit:** orphans cleaned; README/nav synced; bootstrap simplified.

### Health by layer

| Layer | Status | Notes |
|-------|--------|-------|
| Frontend typecheck + vitest | Green | 104 tests pass |
| Frontend production build | Green | login Suspense fixed |
| Backend pytest (full) | Green | 134 passed, 73% cov |
| Architecture coherence | Yellow | Entry + 3 dedicated domains documented |
| Repo hygiene | Green | 0 orphans; DB gitignored |
| Documentation | Green | README, DB_POLICY updated |

---

## 2. Metrics

Source: [`metrics.json`](metrics.json) (regenerated this pass)

| Metric | Prior (AM) | Now (PM) |
|--------|----------:|---------:|
| Code files | 348 | **395** |
| Total lines | 54,536 | **62,603** |
| Code lines | 48,199 | **55,584** |
| Functions | 1,436 | **1,738** |
| Test files | 14 | **36** |
| React components | 76 | **89** |

Large files (>100 KB):

| Path | Size |
|------|------|
| `backend/storage/folio_one.db` | 16.8 MB |
| `frontend/package-lock.json` | 301 KB |
| `frontend/tsconfig.tsbuildinfo` | 162 KB |

---

## 3. Architecture (summary)

See updated [`module-map.md`](module-map.md).

**Data patterns:**

- **Entry + metadata:** habits, food, finance, tasks, notes, people — unified search/RAG.
- **Dedicated tables:** workouts (4 tables), therapy_session_jobs, transcription jobs (sub-app).
- **Two LLM entry points:** `/assistant` (RAG chat) vs `/agent` (digest/articles) vs dashboard agent tools.

This split is **logical for MVP**; main gap is **documentation** and **test coverage** on new modules.

---

## 4. Automated checks

See [`command-outputs.md`](command-outputs.md).

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run test` | PASS (104) |
| `npm run build` | **PASS** |
| `pytest tests/ -q` | **PASS (134)** |
| `pytest --cov=app` | **PASS (73%)** |
| `ruff` | Not run (dev install failed on Windows) |
| Playwright e2e | Not run locally |

---

## 5. Clutter and orphans

See [`orphan-files.txt`](orphan-files.txt).

| Item | Status |
|------|--------|
| `yt_trans/` | Removed |
| `quick-capture.tsx`, `ai-usage.ts` | Deleted |
| Transcription legacy templates | Deleted |
| `finance-ai-status.tsx` | Removed |
| `dev-kanban.ts` | Removed |
| `middleware.ts` | Excluded from orphan script |

---

## 6. Test gaps

See [`test-gaps.md`](test-gaps.md) and [`coverage-baseline.txt`](coverage-baseline.txt).

Coverage baseline **refreshed** — 73% on `app/` (see `coverage-baseline.txt`).

New modules with partial tests:

- Workouts: analytics + API tests pass
- Voice transcribe: none
- Finance dashboard: runtime fix applied; unit test for selected state still open (F-14)

---

## 7. Documentation drift

| Doc | Issue |
|-----|-------|
| README | Updated — nav includes Зал, Сессии, Голос, Канбан; single DB documented |
| smoke-checklist | Updated (+ Зал, Голос, finance dashboard) |
| module-map | Updated |
| DB_POLICY | Aligned — single folio_one.db, legacy DBs marked removed |
| Prior REPORT "69 pytest passed" | Superseded — 134 pass after remediation |

---

## 8. Manual smoke

See [`smoke-results.md`](smoke-results.md). Browser pass **not executed** in audit session; static route/nav verification PASS.

---

## 9. Findings index

Full matrix: [`findings-matrix.md`](findings-matrix.md) (20 items)  
Fix queue: [`remediation-backlog.md`](remediation-backlog.md)

**Fix first (done):** F-01, F-02, F-07, F-18. **Remaining:** F-03 (Windows pip), F-06 (finance parsers), F-12 (commit/PR split).

---

## 10. Comparison to morning audit

| Topic | Morning report | This pass |
|-------|----------------|-----------|
| yt_trans | P0 clutter | Gone |
| Test count | 69 pytest claimed | **134 pass** after remediation |
| Workouts | Not present | Implemented + API tests pass |
| Therapy / RAG | Partially in tree | Expanded, more tests |
| Frontend tests | 91 | 104 |
| Build | Green claimed | **Green** after login Suspense fix |

---

## 11. Artifacts index

| File | Description |
|------|-------------|
| [`metrics.json`](metrics.json) | LOC / file counts |
| [`module-map.md`](module-map.md) | Route → API tables (updated) |
| [`orphan-files.txt`](orphan-files.txt) | Orphan TS analysis |
| [`test-gaps.md`](test-gaps.md) | Coverage matrix |
| [`command-outputs.md`](command-outputs.md) | CI command results |
| [`coverage-baseline.txt`](coverage-baseline.txt) | Refreshed — 73% app coverage |
| [`smoke-checklist.md`](smoke-checklist.md) | Manual QA (updated) |
| [`smoke-results.md`](smoke-results.md) | Static smoke results |
| [`findings-matrix.md`](findings-matrix.md) | All findings |
| [`remediation-backlog.md`](remediation-backlog.md) | Prioritized fixes |
| [`DB_POLICY.md`](DB_POLICY.md) | SQLite policy |

---

*End of reengineering audit report. Remediation pass (single DB + P0 fixes) applied 2026-07-11 evening.*
