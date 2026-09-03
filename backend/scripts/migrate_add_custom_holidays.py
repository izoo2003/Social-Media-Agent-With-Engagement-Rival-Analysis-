"""
Create the custom_holiday table.

Idempotent: safe to run multiple times.

    python backend/scripts/migrate_add_custom_holidays.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import inspect

from app.database.db import engine
from app.database import models  # noqa: F401


def migrate():
    inspector = inspect(engine)
    if "custom_holiday" in inspector.get_table_names():
        print("Table already exists: custom_holiday")
        print("Migration complete.")
        return
    models.CustomHoliday.__table__.create(bind=engine)
    print("Created table: custom_holiday")
    print("Migration complete.")


if __name__ == "__main__":
    migrate()
