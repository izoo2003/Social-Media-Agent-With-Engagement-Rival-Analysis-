"""
Idempotent fix: ensure the Postgres `poststatus` enum contains all labels that
SQLAlchemy expects.

SQLAlchemy stores the enum *name* (uppercase, e.g. 'PARTIAL'). An older schema
added 'partial' in lowercase, so writing a partial status failed with
"invalid input value for enum poststatus: 'PARTIAL'". This adds the missing
uppercase labels. Safe to run multiple times.

Usage:
    python scripts/fix_poststatus_enum.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text

from app.database.db import engine

# Enum member NAMES as SQLAlchemy persists them
REQUIRED_LABELS = ["PENDING", "POSTING", "PUBLISHED", "PARTIAL", "FAILED"]


def fix() -> None:
    # ALTER TYPE ... ADD VALUE must run outside a transaction block
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        existing = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT e.enumlabel FROM pg_enum e "
                    "JOIN pg_type t ON e.enumtypid = t.oid "
                    "WHERE t.typname = 'poststatus'"
                )
            ).fetchall()
        }
        print(f"Existing poststatus labels: {sorted(existing)}")

        for label in REQUIRED_LABELS:
            if label not in existing:
                print(f"  -> adding '{label}'")
                conn.execute(text(f"ALTER TYPE poststatus ADD VALUE IF NOT EXISTS '{label}'"))
            else:
                print(f"  ok '{label}'")

    print("poststatus enum fix complete.")


if __name__ == "__main__":
    fix()
