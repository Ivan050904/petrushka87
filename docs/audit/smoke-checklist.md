# Manual smoke checklist

Run after significant changes to auth, navigation, board, tracking, transcription, or therapy.

## Prerequisites

- `start-dev.bat` or backend + frontend dev servers running
- Demo login: `demo@folio-one.local` / `demo12345` (or **Войти в демо**)
- `alembic upgrade head` (currently `0007_workout_tables`)

## Core flow

- [ ] Login succeeds; sidebar shows all nav items (incl. **Зал**, **Сессии**)
- [ ] **Сегодня** dashboard loads with tasks and entries
- [ ] **Входящие** lists capture items
- [ ] **Канбан** (`/board`) — drag card, open card detail
- [ ] **Заметки** — create note, optional AI analyze if configured
- [ ] **Планы** — calendar slot click → inline create (task/event/meeting)
- [ ] **Финансы** — PDF/CSV import; **Дашборд** tab — category cards, drill-down (no runtime crash)
- [ ] **Питание** — add food entry
- [ ] **Зал** (`/tracking?tab=workouts`) — start session, pick set count, save exercise, history charts
- [ ] **Транскрибация → Голос** — record/transcribe (if `SPEECH_ENABLED=true`)
- [ ] **Транскрибация → Видео и файлы** — iframe loads
- [ ] **Сессии** (`/therapy-sessions`) — upload short audio; progress → analysis
- [ ] **Чат с контекстом** — chat loads; date/finance/kanban queries
- [ ] **Статьи** — digest tabs, search
- [ ] Global search returns results
- [ ] Legacy `/journal` redirects to `/notes`
- [ ] Logout and re-login

## RAG assistant smoke

- [ ] Diary date query finds life note
- [ ] Finance month query
- [ ] Kanban query
- [ ] Therapy session query
- [ ] Cross-module weekly summary

## Automated quick checks

```powershell
cd backend && python -m pytest tests/ -q
cd frontend && npm run typecheck && npm run test && npm run build
```

See [`smoke-results.md`](smoke-results.md) for static verification from audit pass.
