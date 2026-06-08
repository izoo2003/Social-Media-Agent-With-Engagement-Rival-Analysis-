"""
Database initialization script
"""

import sys
from pathlib import Path

# Add parent directory to path so app module can be found
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import inspect

from app.database.db import Base, engine
from app.database import models


def init_db():
    """Initialize database with all models."""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    
    # Verify tables were created
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"✅ Created {len(tables)} tables: {', '.join(tables)}")


if __name__ == "__main__":
    init_db()
