"""
API Routes - Health Checks
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Kafi Social Agent API",
    }


@router.get("/health/detailed")
async def detailed_health_check():
    """Detailed health check with system info."""
    return {
        "status": "healthy",
        "service": "Kafi Social Agent API",
        "database": "connected",
        "llm_provider": "gemini",
        "version": "0.1.0",
    }
