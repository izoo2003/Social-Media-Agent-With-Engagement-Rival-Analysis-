"""
FastAPI Dependency Injection
Shared dependencies for routes
"""

from sqlalchemy.orm import Session

from app.database.db import SessionLocal


def get_db() -> Session:
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
