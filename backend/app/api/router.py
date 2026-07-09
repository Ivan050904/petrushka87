from fastapi import APIRouter

from app.api.routes import auth, dashboard, entries, resources, tasks

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(entries.router, prefix="/entries", tags=["entries"])
api_router.include_router(resources.router, prefix="/resources", tags=["resources"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
