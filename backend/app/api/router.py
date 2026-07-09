from fastapi import APIRouter

from app.api.routes import assistant, auth, dashboard, entries, entry_links, finance, notes, resources, tasks

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(entries.router, prefix="/entries", tags=["entries"])
api_router.include_router(entry_links.router, prefix="/entries", tags=["entry-links"])
api_router.include_router(finance.router, prefix="/finance", tags=["finance"])
api_router.include_router(notes.router, prefix="/notes", tags=["notes"])
api_router.include_router(resources.router, prefix="/resources", tags=["resources"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(assistant.router, prefix="/assistant", tags=["assistant"])
