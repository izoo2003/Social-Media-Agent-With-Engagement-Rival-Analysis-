"""
Add kind on kpi_custom_definition (custom vs website_maintenance).

Idempotent: safe to run multiple times.

    python backend/scripts/migrate_add_kpi_card_kind.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import inspect, text

from app.database.db import engine


def migrate():
    inspector = inspect(engine)
    if "kpi_custom_definition" not in inspector.get_table_names():
        print("Table missing: kpi_custom_definition — run migrate_add_kpis.py first.")
        return

    columns = {col["name"] for col in inspector.get_columns("kpi_custom_definition")}
    if "kind" in columns:
        print("Column already exists: kpi_custom_definition.kind")
    else:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE kpi_custom_definition "
                    "ADD COLUMN kind VARCHAR(40) DEFAULT 'custom' NOT NULL"
                )
            )
        print("Added column: kpi_custom_definition.kind")

    print("Migration complete.")


if __name__ == "__main__":
    migrate()
