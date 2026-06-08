"""
One-off migration: add linkedin_accounts_results column and partial post status.

Run from backend directory:
    python scripts/migrate_linkedin_multi_account.py
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.database.db import engine


def migrate() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_enum e
                        JOIN pg_type t ON e.enumtypid = t.oid
                        WHERE t.typname = 'poststatus' AND e.enumlabel = 'partial'
                    ) THEN
                        ALTER TYPE poststatus ADD VALUE 'partial';
                    END IF;
                END
                $$;
                """
            )
        )

        conn.execute(
            text(
                """
                ALTER TABLE content
                ADD COLUMN IF NOT EXISTS linkedin_accounts_results JSONB;
                """
            )
        )

    print("Migration complete: linkedin_accounts_results column and partial post status added.")


if __name__ == "__main__":
    migrate()
