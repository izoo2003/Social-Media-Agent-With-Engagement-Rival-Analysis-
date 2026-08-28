"""
Create KPI Creation tables.

Idempotent: safe to run multiple times.

    python backend/scripts/migrate_add_kpis.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import inspect

from app.database.db import engine
from app.database import models  # noqa: F401


def migrate():
    inspector = inspect(engine)
    existing = set(inspector.get_table_names())

    created = []
    # Custom definitions first so manual_entry FK target exists.
    if "kpi_custom_definition" not in existing:
        models.KpiCustomDefinition.__table__.create(bind=engine)
        created.append("kpi_custom_definition")
    else:
        print("Table already exists: kpi_custom_definition")

    existing = set(inspect(engine).get_table_names())
    if "kpi_auto_event" not in existing:
        models.KpiAutoEvent.__table__.create(bind=engine)
        created.append("kpi_auto_event")
    else:
        print("Table already exists: kpi_auto_event")

    existing = set(inspect(engine).get_table_names())
    if "kpi_manual_entry" not in existing:
        models.KpiManualEntry.__table__.create(bind=engine)
        created.append("kpi_manual_entry")
    else:
        print("Table already exists: kpi_manual_entry")

    if created:
        print(f"Created table(s): {', '.join(created)}")
    print("Migration complete.")


if __name__ == "__main__":
    migrate()
