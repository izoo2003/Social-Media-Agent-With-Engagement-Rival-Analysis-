"""
Database Reset Script
Drops all tables and recreates them from current SQLAlchemy models.
WARNING: This will delete ALL existing data!
"""

import sys
from pathlib import Path

# Add parent directory to path so app module can be found
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import inspect, text

from app.database.db import Base, engine
from app.database import models


def reset_db():
    """Drop all tables and recreate them from current models."""
    print("WARNING: This will delete ALL existing data!")
    print("Dropping all tables...")
    
    # Drop all tables
    Base.metadata.drop_all(bind=engine)
    
    # Recreate all tables
    Base.metadata.create_all(bind=engine)
    
    # Verify tables
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    print(f"✅ Created {len(tables)} tables: {', '.join(tables)}")
    
    # Show columns for the content table (most important)
    if "content" in tables:
        columns = [col["name"] for col in inspector.get_columns("content")]
        print(f"\n📋 'content' table columns: {', '.join(columns)}")


if __name__ == "__main__":
    confirm = input("Type 'YES' to confirm you want to delete all data: ")
    if confirm == "YES":
        reset_db()
    else:
        print("Cancelled.")
