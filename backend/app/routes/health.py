"""
API Routes - Health Checks
"""

from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Kafi Social Agent API",
        "app_mode": settings.APP_MODE,
    }


@router.get("/health/detailed")
async def detailed_health_check():
    """Detailed health check with system info."""
    payload = {
        "status": "healthy",
        "service": "Kafi Social Agent API",
        "app_mode": settings.APP_MODE,
        "database": "connected",
        "version": settings.API_VERSION,
    }
    if settings.APP_MODE == "full":
        payload["llm_provider"] = settings.LLM_PROVIDER
    return payload
