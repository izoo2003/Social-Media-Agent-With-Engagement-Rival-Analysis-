"""
Database Session Factory & Connection Management
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

# Database engine
#
# Resilience settings matter a lot when DATABASE_URL points at a Supabase pooler:
# - pool_pre_ping drops stale/closed pooler connections before they're used
# - pool_recycle proactively refreshes connections the pooler may have closed
# - pool_timeout / connect_timeout ensure we fail fast instead of hanging forever
# - statement_timeout (server-side) caps any single query so one slow/stuck query
#   can never freeze the whole app (the route handlers are async but do blocking
#   DB I/O, so an unbounded query would otherwise block the entire event loop).
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DATABASE_ECHO,
    future=True,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=5,
    pool_timeout=10,
    connect_args={
        "connect_timeout": 10,
        "options": "-c statement_timeout=30000",  # 30s hard cap per statement
    },
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Base class for ORM models
Base = declarative_base()


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
