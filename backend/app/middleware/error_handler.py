"""
Global Exception Handlers
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.utils.exceptions import KafiAgentException


def setup_exception_handlers(app: FastAPI) -> None:
    """Setup global exception handlers."""

    @app.exception_handler(KafiAgentException)
    async def kafi_exception_handler(request, exc):
        return JSONResponse(
            status_code=400,
            content={"detail": str(exc), "error_type": type(exc).__name__},
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request, exc):
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "error_type": type(exc).__name__},
        )
