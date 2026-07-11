# Remediation backlog (audit-only — not executed)

Prioritized fix queue for a follow-up implementation pass. Do not start until audit reviewed.

## P0 — unblock CI / build

1. **F-01** Fix workouts DELETE 204 responses (`backend/app/api/routes/workouts.py`)
2. **F-02** Fix login page Suspense for `useSearchParams` (`frontend/src/app/login/page.tsx`)
3. Re-run `pytest tests/ -q` and `npm run build`; update `coverage-baseline.txt`

## P1 — stability

4. **F-03** Windows dev install: adjust `pyproject.toml` readme path or document venv workflow
5. **F-05** Ensure FinanceCategoryCard fix is committed
6. Verify GitHub Actions CI on next push

## P2 — structure & hygiene

7. **F-07** Stop tracking `folio_one.db`; rely on `bootstrap_data.py`
8. **F-12** Commit/split uncommitted feature work (workouts, therapy, RAG, finance UI)
9. **F-06** Finance parser strategy decision (single source of truth)
10. **F-09** Remove or integrate `finance-ai-status.tsx`
11. **F-08** README nav + implemented features sync
12. **F-13/F-14** Tests for workouts panel, voice panel, finance dashboard

## P3 — cleanup

13. **F-10** Remove `dev-kanban.ts`
14. **F-11** Update `audit_orphans.py` to skip `middleware.ts`
15. **F-15** Recharts v3 migration (optional)

## Estimated effort

| Priority | Effort |
|----------|--------|
| P0 | 2–4 hours |
| P1 | 2–4 hours |
| P2 | 1–2 weeks |
| P3 | 1–2 days |
