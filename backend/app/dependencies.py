"""
FastAPI Dependency Injection
Shared dependencies for routes
"""

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.database.db import SessionLocal
from app.services import auth_service


def get_db() -> Session:
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_current_user(request: Request) -> str:
    """Return the authenticated dashboard username from the JWT."""
    if hasattr(request.state, "dashboard_user"):
        return request.state.dashboard_user

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")

    payload = auth_service.decode_access_token(auth[7:].strip())
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    return payload["sub"]


async def get_current_user_role(request: Request) -> str:
    """Return senior | junior from the JWT (defaults to senior for legacy tokens)."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = auth_service.decode_access_token(auth[7:].strip())
        return auth_service.role_from_payload(payload)
    return "senior"
