# Test gaps (updated 2026-07-11 reengineering audit)

## Automated run summary

| Suite | Status | Count |
|-------|--------|------:|
| Frontend vitest | PASS | 104 tests / 6 files |
| Backend pytest (full) | **BLOCKED** | 12 collection errors (workouts 204 + app import) |
| Backend pytest (isolated) | PASS | 25 tests (no app.main) |
| Frontend typecheck | PASS | — |
| Frontend next build | **FAIL** | `/login` Suspense |
| Playwright e2e | Not run locally | CI: `.github/workflows/ci.yml` |

## Backend — covered

| Area | Test file | Notes |
| --- | --- | --- |
| Auth, entries, resources | `test_mvp_api.py` | Blocked by app import |
| AI contract | `test_ai_contract.py` | |
| Assistant | `test_assistant.py` | Blocked |
| Demo seed | `test_demo_seed.py` | Blocked |
| Digest / psych | `test_digest.py`, `test_psych_digest.py`, `test_digest_feedback.py` | Blocked |
| Finance API + Excel | `test_finance_api.py`, `test_finance_excel_import.py` | Blocked |
| Finance preview/categorize/dedup | `test_finance_preview.py`, `test_finance_categorize.py`, `test_finance_dedup.py` | dedup OK isolated |
| Entry links | `test_entry_links.py` | Blocked |
| Notes API | `test_notes_api.py` | Blocked |
| Context RAG | `test_context_orchestrator.py`, `test_context_retrievers.py`, `test_query_router.py` | Partial OK isolated |
| Embeddings | `test_embeddings_provider.py` | OK isolated |
| Transcription worker | `test_transcription_worker.py` | OK isolated |
| Therapy worker / analyze / retriever | `test_therapy_*.py` | Partial OK isolated |
| Alembic migrations | `test_alembic_migrations.py` | OK isolated |
| Storage | `test_storage.py` | |
| **Workouts analytics** | `test_workouts_analytics.py` | **PASS** (5 tests) |
| **Workouts API** | `test_workouts_api.py` | Blocked (same app import) |
| User context | `test_user_context.py` | |

## Frontend — covered

| Area | Test file |
| --- | --- |
| Nav config (+ tracking-workouts) | `nav-config.test.ts` |
| Capture parsing | `capture-parsing.test.ts` |
| Bank import | `bank-import.test.ts` |
| Finance import helpers | `finance-import.test.ts` |
| Finance dedup | `finance-dedup.test.ts` |
| **Workouts helpers** | `workouts.test.ts` |

## Remaining gaps (priority)

| Area | Priority | Gap |
| --- | --- | --- |
| Workouts API integration | P0 | Blocked until DELETE 204 fixed |
| Finance dashboard UI | P1 | Runtime bug (`selected` prop) — no component test |
| Voice transcribe panel | P1 | No tests |
| WorkoutsPanel wizard | P2 | No component tests |
| Login page / Suspense | P0 | Build fails — no test catches prerender |
| Page/component tests (app-shell, kanban) | P2 | |
| Embeddings indexer integration | P3 | |
| Playwright beyond login smoke | P2 | |
| Therapy sessions upload E2E | P2 | |

## Coverage baseline

Full `pytest --cov=app` not captured — collection blocked.

Isolated modules (context, workouts analytics, workers): **25 passed** in 2.4s.

Previous baseline in `coverage-baseline.txt` (71% overall) is **stale** until app import fixed.
