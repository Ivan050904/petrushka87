# Module map — Folio-One

Updated: 2026-07-11 reengineering audit  
Commit baseline: `1a8c2e4` (+ uncommitted modules below)

## Frontend: Route → Page → Feature → API

| Route | Page | Feature module | Primary API |
|-------|------|----------------|-------------|
| `/` | `app/page.tsx` | redirect → `/dashboard` | — |
| `/dashboard` | `app/dashboard/page.tsx` | capture, dashboard, assistant | `GET /dashboard`, `GET/POST /entries` |
| `/inbox` | `app/inbox/page.tsx` | `features/inbox` | `GET/PATCH /entries` |
| `/board` | `app/board/page.tsx` | `features/board` (DevKanbanView) | `GET/PATCH /entries` (kanban metadata) |
| `/notes` | `app/notes/page.tsx` | `features/notes` | `GET/POST/PATCH /entries`, `POST /notes/analyze` |
| `/articles` | `app/articles/page.tsx` | `features/articles` | `GET /entries`, `GET/POST /agent/digest/*` |
| `/plans` | `app/plans/page.tsx` | `features/plans` (+ calendar-create-form) | `GET/POST/PATCH /entries`, `POST /tasks/parse` |
| `/tracking?tab=habits` | `app/tracking/page.tsx` | `HabitsPanel` | `GET/POST /entries` (type=habit) |
| `/tracking?tab=finance` | same | `FinancePanel`, `FinanceDashboard` | `GET/POST /entries`, `POST /finance/*` |
| `/tracking?tab=food` | same | Food panel (in tracking-view) | `GET/POST /entries` (type=food) |
| `/tracking?tab=workouts` | same | **`WorkoutsPanel`** | **`/workouts/*`** (dedicated tables) |
| `/transcription` | `app/transcription/page.tsx` | **`TranscriptionView`**: voice + iframe | Voice: `POST /assistant/transcribe`; iframe: sub-app |
| `/therapy-sessions` | `app/therapy-sessions/page.tsx` | `features/therapy-sessions` | **`/therapy-sessions/*`** |
| `/assistant` | `app/assistant/page.tsx` | `features/assistant` (RAG chat) | `POST /assistant/conversations/*` |
| `/reference` | `app/reference/page.tsx` | people + resources | `GET/POST /entries`, `POST /resources` |
| `/search` | `app/search/page.tsx` | inline | `GET /entries?q=` |
| `/login` | `app/login/page.tsx` | auth + demo | `POST /auth/login`, `/auth/register` |

### Sidebar nav (`nav-config.ts`)

Order: Сегодня → Входящие → Канбан → Заметки → Статьи → Планы → Привычки → Финансы → Питание → **Зал** → Транскрибация → **Сессии** → Чат → Справочник

Auth gate: `frontend/src/middleware.ts` (cookie `folio_one_auth`)

### Legacy redirects

| Route | Target |
|-------|--------|
| `/tasks` | `/plans?tab=tasks` |
| `/events` | `/plans?tab=events` |
| `/habits` | `/tracking?tab=habits` |
| `/finance` | `/tracking?tab=finance` |
| `/people` | `/reference?tab=people` |
| `/resources` | `/reference?tab=resources` |
| `/entries` | `/search` |
| `/journal` | **`/notes`** (page is redirect only) |

## Backend: API route → Service → Model

| Prefix | Router | Service | Models / storage |
|--------|--------|---------|------------------|
| `/auth` | `routes/auth.py` | inline | `User` |
| `/dashboard` | `routes/dashboard.py` | entry queries | `Entry` |
| `/entries` | `routes/entries.py` | optional AI classify | `Entry` |
| `/entries` (links) | `routes/entry_links.py` | link CRUD | `EntryLink` |
| `/finance` | `routes/finance.py` | `services/finance/*` | `Entry` + metadata |
| `/notes` | `routes/notes.py` | `services/ai/life_notes.py` | `Entry` |
| `/resources` | `routes/resources.py` | `storage/*` | `Entry` + files |
| `/tasks` | `routes/tasks.py` | task parse | `Entry` metadata |
| `/assistant` | `routes/assistant.py` | assistant + speech + RAG | `AssistantConversation`, embeddings |
| `/agent` | `routes/agent.py` | digest, psych articles | `Entry` (articles) |
| `/therapy-sessions` | **`routes/therapy_sessions.py`** | `services/therapy_sessions/*` | **`TherapySessionJob`** |
| `/workouts` | **`routes/workouts.py`** | `services/workouts/analytics.py` | **`ExerciseCatalog`, `WorkoutSession`, `WorkoutExercise`, `PersonalRecord`** |

Alembic head: **`0007_workout_tables`**

## Data model patterns

| Domain | Pattern | Rationale |
|--------|---------|-----------|
| Habits, food, finance, tasks, notes | `Entry` + JSON metadata | Flexible MVP, unified search/RAG |
| Gym / Зал | Dedicated SQL tables | Catalog, sets JSON, analytics (max weight) |
| Therapy sessions | Dedicated `therapy_session_jobs` | Long pipeline, files, analysis JSON |
| Transcription | Sub-app DB + optional Entry sync | Heavy media pipeline |

## Finance import dual stack

| Layer | Bank parsers | Behavior |
|-------|--------------|----------|
| Frontend | `features/tracking/bank-import/parsers/*` | Full Sber/Tinkoff/etc. client-side |
| Backend | `parser_registry.py` | `generic` CSV + **StubBankParser** for named banks |

UI can parse PDF/CSV locally; backend preview for named banks falls back to generic with warning.

## Transcription

| Tab | UI | Backend |
|-----|-----|---------|
| Голос | `VoiceTranscribePanel` | `POST /assistant/transcribe` (Whisper) |
| Видео и файлы | iframe → `/transcription/sso` | `backend/transcription/` worker pipeline |

## Environment variables (summary)

See [`backend/.env.example`](../../backend/.env.example) — groups: core, AI/RAG (`CONTEXT_*`, `NOTES_AI_*`), digest (`DIGEST_*`, `PSYCH_*`), therapy (`THERAPY_*`), speech (`SPEECH_*`, `WHISPER_*`), storage.

Frontend: `NEXT_PUBLIC_API_URL`

## Assistant vs Agent (naming)

| User label | Route | Purpose |
|------------|-------|---------|
| Чат с контекстом | `/assistant` | RAG over user data |
| Dashboard agent panel | `/assistant/agent/chat` | Tool actions (create task) |
| Статьи / digest | `/agent/digest/*` | Scheduled article fetch |
