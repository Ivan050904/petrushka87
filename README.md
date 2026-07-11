# Folio-One

Life folio — tasks, notes, habits, and more.

Personal system for capturing and structuring daily life information.

The repository is organized as a small monorepo:

- `backend` - FastAPI, SQLAlchemy 2.0, SQLite, Alembic
- `frontend` - Next.js 15, TypeScript, Tailwind, shadcn-style primitives

## Implemented foundation

- User registration and login
- JWT-protected API
- Universal `Entry` entity
- Entry CRUD
- SQLite schema and Alembic migration
The frontend uses scenario-based navigation: **Сегодня**, **Входящие**, **Канбан**, **Заметки**, **Статьи**, **Планы**, **Привычки**, **Финансы**, **Питание**, **Зал**, **Транскрибация** (вкладки «Голос» и «Видео»), **Сессии**, **Чат с контекстом**, **Справочник**, plus global search. Legacy routes (`/tasks`, `/events`, `/habits`, `/journal`, etc.) redirect to the new sections.

- Typed Tasks, Habits, Finance, People, Notes, and Resources screens
- Search UI with type filters
- Dashboard summary for active tasks, latest entries, recent expenses, and notes
- Draft persistence for daily input forms
- Optional OpenAI-compatible Entry classification contract
- Configurable file storage interface (`local` now, optional `s3` provider prepared)

## MVP coverage

| Area | Status |
| --- | --- |
| Sprint 1: auth, Entry CRUD, SQLite, Alembic, base UI | Implemented |
| Sprint 2: Inbox quick capture | Implemented |
| Sprint 3: AI classification for note entries | Implemented, disabled by default |
| Sprint 4: Tasks with status, deadline, project, parent task | Implemented |
| Sprint 5: Finance entries | Implemented |
| Sprint 6: People cards | Implemented |
| Sprint 7: Diary and notes | Implemented |
| Sprint 8: file resources for PDF, DOCX, PPTX, MD | Implemented without content indexing |
| Sprint 9: search by title, content, metadata, and type | Implemented |
| Sprint 10: daily dashboard | Implemented |

Deferred by design: knowledge graph, vector DB, complex workflows, Telegram bot, and dedicated media/book trackers.

Implemented beyond original MVP notes: food tracking, gym workouts (`/tracking?tab=workouts`), therapy sessions, embedded transcription with voice tab, plans calendar, dual assistant modes (dashboard agent actions vs `/assistant` context chat).

## Hybrid RAG architecture

«Чат с контекстом» uses a **hybrid retriever** (not a standalone vector DB):

1. **Query router** ([`query_intent.py`](backend/app/services/context/query_intent.py)) — keyword + structured signals → one or more scopes: `notes`, `plans`, `finance`, `people`, `transcription`, `kanban`, or `all`.
2. **Per-module retrievers** ([`retrievers/`](backend/app/services/context/retrievers/)) — SQL pins (dates, months, weeks) + BM25 + scoped embeddings.
3. **Orchestrator** ([`orchestrator.py`](backend/app/services/context/orchestrator.py)) — merge, dedupe, rerank, optional entry-link boost.
4. **Single index** — `entries` + `entry_embeddings` with `scope`, `entry_type`, `entry_date` metadata.

Config:

```powershell
CONTEXT_ROUTER_MULTI_SCOPE=true
CONTEXT_EMBEDDINGS_ENABLED=true
CONTEXT_EMBEDDINGS_PROVIDER=auto   # hash fallback without API key
```

Backfill after schema/import changes:

```powershell
cd backend
alembic upgrade head
python scripts/reindex_embeddings.py --user-email demo@folio-one.local
```

## Assistant modes

| UI entry | Backend | LLM config | Purpose |
| --- | --- | --- | --- |
| Dashboard panel | `/assistant/agent/chat` | `ASSISTANT_*` | Agent actions on entries (create task/event) |
| Nav «Чат с контекстом» | `/assistant/conversations/*` | `NOTES_AI_*` → fallback `OPENAI_COMPATIBLE_*` | RAG chat over notes, plans, finance, transcriptions |

### RAG context settings

Tune retrieval for «Чат с контекстом» in `backend/.env`:

```powershell
CONTEXT_CANDIDATE_LIMIT=1500
CONTEXT_SNIPPET_LIMIT=40
CONTEXT_MAX_CHARS=24000
CONTEXT_DATE_LOOKUP_ENABLED=true
CONTEXT_DEBUG=false
```

After changing indexing logic, backfill embeddings:

```powershell
cd backend
python scripts/reindex_embeddings.py --user-email demo@folio-one.local
```

Use `--dry-run` to count records without writing.

## Run locally

1. Copy environment files:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env.local
```

2. Install and run the backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

3. Install and run the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:3000

Backend API: http://localhost:8000/docs

## Demo account

A demo user with pre-filled tasks, events, finance, habits, food, people, notes, and resources is created automatically by `start-dev.bat`. You can also seed it manually:

```powershell
cd backend
python scripts/seed_demo.py
```

Use `--reset` to delete existing demo entries and recreate them:

```powershell
python scripts/seed_demo.py --reset
```

Credentials:

- Email: `demo@folio-one.local`
- Password: `demo12345`

Local dev account (Petr):

- Email: `petr@petr.local`
- Password: `petr12345`

See `backend/LOCAL_ACCOUNTS.example.txt` for the full list.

On the login screen, click **Войти в демо** for one-click access.

The MVP uses a **single** SQLite database at `backend/storage/folio_one.db` (not committed to git; bootstrap via `scripts/bootstrap_data.py`). Local files live at `backend/storage/files`. Legacy `letscore.db` and `transcription/jobs.db` are no longer used.

Set `DATABASE_URL=sqlite:///./storage/folio_one.db` in `backend/.env` (this is the default in `.env.example`).

## Quick checks

Use these commands to verify the code without starting dev servers:

```powershell
cd backend
python -m compileall app tests alembic
python -m pytest tests -q
```

```powershell
cd frontend
npm run typecheck
```

## File storage

Files are stored locally by default:

```powershell
FILE_STORAGE_PROVIDER=local
LOCAL_STORAGE_PATH=./storage/files
```

The API routes use the `FileStorage` protocol and `get_file_storage()` factory, so switching storage providers does not require changing Entry or Resource route logic.

An optional S3-compatible provider is prepared for later use:

```powershell
pip install -e ".[s3]"
FILE_STORAGE_PROVIDER=s3
S3_BUCKET_NAME=...
S3_PREFIX=folio-one
S3_ENDPOINT_URL=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

## AI classification

AI is disabled by default. To enable classification after creating `note` entries, set:

```powershell
AI_CLASSIFICATION_ENABLED=true
OPENAI_COMPATIBLE_API_KEY=...
OPENAI_COMPATIBLE_MODEL=...
```

For Yandex AI Studio, use the dedicated provider:

```powershell
AI_PROVIDER=yandex
AI_CLASSIFICATION_ENABLED=true
YANDEX_CLOUD_FOLDER_ID=...
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_MODEL=aliceai-llm-flash/latest
```

For Yandex Alice AI LLM Flash, every successful classification stores token usage and estimated
cost in `entry.metadata.ai.usage`. The MVP uses this sync tariff for estimates:
`0.1 RUB / 1K input tokens`, `0.025 RUB / 1K cached input tokens`,
`0.025 RUB / 1K tool tokens`, and `0.2 RUB / 1K output tokens`.

The provider is isolated behind `app/services/ai`, so it can be replaced without changing route code.

## Daily article digest (Ollama + DuckDuckGo)

The backend can run a free daily development article digest:

- **Ollama** filters and summarizes candidates
- **DuckDuckGo** provides search results without an API key
- Articles are saved as `resource` entries with `metadata.kind=article`
- The frontend shows them on the **Статьи** page

### Setup

1. Install and start [Ollama](https://ollama.com), then pull a model:

```powershell
ollama pull qwen2.5-coder:7b
```

2. Configure `backend/.env`:

```powershell
DIGEST_ENABLED=true
DIGEST_TOPICS=ии агенты,cursor ai,claude codex,claude агент,cursor ide
DIGEST_MAX_ARTICLES=5
DIGEST_SCHEDULE_HOUR=8
DIGEST_USER_EMAIL=petr@petr.local
DIGEST_SCHEDULER_ENABLED=true
DIGEST_SEARCH_PROVIDER=habr
DIGEST_LLM_BASE_URL=http://localhost:11434/v1
DIGEST_LLM_API_KEY=ollama
DIGEST_LLM_MODEL=qwen2.5-coder:7b
USER_TIMEZONE=Asia/Vladivostok
```

3. Install dependencies:

```powershell
cd backend
pip install duckduckgo-search
```

4. Run manually:

```powershell
python scripts/run_daily_digest.py
```

Or open **Статьи** in the sidebar and click **Запустить дайджест сейчас**.

### Automatic daily run at 8:00

When `DIGEST_SCHEDULER_ENABLED=true`, the backend starts a background scheduler on startup. It runs `run_daily_digest()` every day at `DIGEST_SCHEDULE_HOUR` in `USER_TIMEZONE`. Articles are saved to the account from `DIGEST_USER_EMAIL`.

Requirements: backend (uvicorn) and Ollama must be running 24/7 on the server.

On backend startup, logs should contain: `Digest scheduler enabled, next run at ...`

### Local verification before deploy

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_digest.py -v
.\.venv\Scripts\python.exe scripts\run_daily_digest.py
.\.venv\Scripts\python.exe scripts\test_digest_scheduler.py
```

Check `backend/storage/logs/digest.log` and `digest_state.json`.

To test the scheduler without waiting until 8:00, temporarily set `DIGEST_SCHEDULE_HOUR` to the current hour, restart backend, and watch `digest.log`.

### Windows Task Scheduler (optional fallback)

Create a daily task at 08:00 pointing to:

```text
C:\path\to\petrushka87\backend\scripts\run_daily_digest.bat
```

Logs: `backend/storage/logs/digest.log`.
