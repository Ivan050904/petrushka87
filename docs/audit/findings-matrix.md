# Findings matrix — reengineering audit 2026-07-11

| ID | Severity | Area | File / location | Status | Recommendation |
|----|----------|------|-----------------|--------|----------------|
| F-01 | P0 | Backend API | `workouts.py` DELETE routes | **Resolved** | Returns `Response(status_code=204)` |
| F-02 | P0 | Frontend build | `app/login/page.tsx` | **Resolved** | LoginForm wrapped in Suspense |
| F-03 | P1 | Dev env | `pip install -e ".[dev]"` on Windows | Open | Fix pyproject README path or use `.venv` from repo root; document in README |
| F-04 | P1 | Tests | 12 test modules importing `app.main` | **Resolved** | Fixed by F-01 — 134 pytest pass |
| F-05 | P1 | Runtime UX | Finance dashboard | **Resolved** | `FinanceCategoryCard`: `selected = false` in destructuring |
| F-06 | P2 | Architecture | Finance parsers | Open | Document dual stack; or port frontend parsers to backend / hide stub banks in UI |
| F-07 | P2 | Repo hygiene | `backend/storage/folio_one.db` tracked | **Resolved** | `git rm --cached`; gitignored; bootstrap only |
| F-08 | P2 | Docs drift | `README.md` nav list | **Resolved** | Зал, Сессии, Канбан, Голос added; single DB note |
| F-09 | P2 | Orphans | `finance-ai-status.tsx` | **Resolved** | Deleted (unused) |
| F-10 | P3 | Orphans | `dev-kanban.ts` | **Resolved** | Deleted |
| F-11 | P3 | False positive | `middleware.ts` in orphan script | **Resolved** | Excluded in audit_orphans.py |
| F-12 | P2 | Uncommitted work | 95+ modified/untracked files vs `1a8c2e4` | Open | Commit or split into PRs; large feature batch unreviewed |
| F-13 | P2 | Test gaps | WorkoutsPanel, VoiceTranscribePanel | Open | Add component or e2e tests |
| F-14 | P2 | Test gaps | Finance dashboard | Open | Add test for category card selected state |
| F-15 | P3 | Dependencies | `recharts@2.15` deprecated npm warn | Info | Plan upgrade to v3 when convenient |
| F-16 | P2 | CI | Local vs Linux pip install | Info | CI likely green; local Windows may differ |
| F-17 | P2 | module-map | Prior audit stale | Done | Updated in this pass |
| F-18 | P3 | Legacy DBs | letscore.db, jobs.db | **Resolved** | Removed from disk/code/docs; single folio_one.db |
| F-19 | P2 | Data pattern | Entry vs workout tables | Info | Documented in module-map; intentional |
| F-20 | P3 | Agent import chain | `ddgs` required for any app.main import | Info | Ensure dev deps installed; lazy-import web_search optional |

## Severity legend

- **P0** — CI/build broken or app won't start tests
- **P1** — Major feature/test blocked
- **P2** — Tech debt, drift, partial coverage
- **P3** — Cleanup, docs, cosmetic
