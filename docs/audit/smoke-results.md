# Smoke results — static audit 2026-07-11 (post remediation)

Manual browser pass not executed. Automated checks and static verification below.

## Automated checks (PASS)

| Check | Result |
|-------|--------|
| `pytest tests/ -q` | **134 passed** |
| `pytest tests/ -q --cov=app` | **73% total coverage** |
| `npm run typecheck` | PASS |
| `npm run test` (vitest) | PASS — 104 tests |
| `npm run build` | PASS (login Suspense fixed) |
| `python scripts/audit_orphans.py` | 0 orphans |

## Verified statically (PASS)

| Check | Evidence |
|-------|----------|
| Nav includes Зал, Сессии, Голос, Канбан | `nav-config.ts`, README updated |
| `/journal` → `/notes` | `app/journal/page.tsx` redirect |
| Workouts routing | `tracking-view.tsx` tab=workouts → WorkoutsPanel |
| Transcription voice tab | `transcription-view.tsx` tabs voice/legacy |
| FinanceCategoryCard `selected` prop | destructured with default `false` |
| Single DB policy | `folio_one.db` only; legacy DBs removed from code/docs |
| Bootstrap | `bootstrap_data.py` — alembic + clean_orphan_files + demo seed |
| Alembic at 0007 | `0007_workout_tables` (head) |

## Known open (not in remediation scope)

| Check | Issue | Severity |
|-------|-------|----------|
| Finance backend named banks | StubBankParser vs frontend real parsers | P2 (by design) |
| Windows `pip install -e ".[dev]"` | README path outside package root | P2 |

## Requires manual browser (NOT RUN)

- Login UI, sidebar click-through all nav items
- Finance dashboard category drill-down UX
- Workouts wizard end-to-end save
- Voice recording + Whisper response
- Therapy upload pipeline
- Kanban drag-and-drop
- RAG chat quality

Recommendation: run [`smoke-checklist.md`](smoke-checklist.md) once before next release.
