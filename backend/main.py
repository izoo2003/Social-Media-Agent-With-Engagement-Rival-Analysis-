"""
FastAPI Application Entry Point
Kafi Commodities Social Media & Branding AI Agent System
"""

import logging
from contextlib import asynccontextmanager

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.middleware.cors import get_cors_settings
from app.middleware.error_handler import setup_exception_handlers
from app.routes import health, content, calendar, analytics, qa, scraper, rival, youtube_auth, meta_auth, social


# Structured logging setup
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events."""
    # Startup
    logger.info(f"Starting Kafi Social Agent - Environment: {settings.ENVIRONMENT}")
    logger.info(f"API Version: {settings.API_VERSION}")
    logger.info(f"LLM Provider: Google Gemini ({settings.GEMINI_MODEL})")
    logger.info(f"API Docs: http://localhost:{settings.PORT}/docs")

    # Log storage backend info
    if settings.SUPABASE_URL and settings.SUPABASE_SECRET_KEY:
        logger.info(
            f"Storage Backend: Supabase (bucket: {settings.SUPABASE_STORAGE_BUCKET})"
        )
    else:
        logger.info("Storage Backend: Local Disk (backend/uploads/)")

    # Start the background post scheduler (auto-publishes due calendar events)
    from app.services.scheduler import start_scheduler

    start_scheduler()

    yield
    # Shutdown
    from app.services.scheduler import shutdown_scheduler

    shutdown_scheduler()
    logger.info("Shutting down Kafi Social Agent")


# Initialize FastAPI app
app = FastAPI(
    title="Kafi Commodities Social Media & Branding AI Agent",
    description="Specialized AI agent system for B2B/B2C social media strategy, content generation, and optimization",
    version=settings.API_VERSION,
    lifespan=lifespan,
)

# Setup CORS middleware
cors_settings = get_cors_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_settings["allow_origins"],
    allow_credentials=cors_settings["allow_credentials"],
    allow_methods=cors_settings["allow_methods"],
    allow_headers=cors_settings["allow_headers"],
)

# Setup exception handlers
setup_exception_handlers(app)

# Mount uploads directory for serving media files
uploads_dir = Path(__file__).parent / "uploads"
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Include route modules
app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(content.router, prefix="/api/v1", tags=["Content"])
app.include_router(calendar.router, prefix="/api/v1", tags=["Calendar"])
app.include_router(analytics.router, prefix="/api/v1", tags=["Analytics"])
app.include_router(qa.router, prefix="/api/v1", tags=["QA"])
app.include_router(scraper.router, prefix="/api/v1", tags=["Scraper"])
app.include_router(rival.router, prefix="/api/v1", tags=["Rival Review"])
app.include_router(youtube_auth.router, prefix="/api/v1", tags=["YouTube Auth"])
app.include_router(meta_auth.router, prefix="/api/v1", tags=["Meta Auth"])
app.include_router(social.router, prefix="/api/v1", tags=["Social"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "status": "success",
        "message": "Kafi Commodities Social Media & Branding AI Agent API",
        "api_version": settings.API_VERSION,
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development",
        log_level=settings.LOG_LEVEL.lower(),
    )
