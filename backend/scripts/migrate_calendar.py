"""
Idempotent migration: add scheduling columns to the calendar_event table.

Safe to run multiple times. Use this if the `calendar_event` table already
exists from a previous version (Base.metadata.create_all does NOT alter
existing tables).

Usage:
    python scripts/migrate_calendar.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text

from app.database.db import engine


# Postgres supports "ADD COLUMN IF NOT EXISTS" so this is fully idempotent.
STATEMENTS = [
    "ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS platforms JSON",
    "ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS draft_mode BOOLEAN DEFAULT FALSE",
    "ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS override_title TEXT",
    "ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS override_body TEXT",
    "ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS linkedin_account_labels JSON",
    "ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS published_at TIMESTAMP",
    "ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS error_message TEXT",
    "ALTER TABLE calendar_event ADD COLUMN IF NOT EXISTS results JSON",
]


def migrate() -> None:
    print("Migrating calendar_event table...")
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            print(f"  -> {stmt}")
            conn.execute(text(stmt))
    print("Calendar migration complete.")


if __name__ == "__main__":
    migrate()
