"""
Create campaign and campaign_item tables.
Idempotent: safe to run multiple times.

    python backend/scripts/migrate_add_campaigns.py
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
    if "campaign" not in existing:
        models.Campaign.__table__.create(bind=engine)
        created.append("campaign")
    else:
        print("Table already exists: campaign")

    # Re-inspect so campaign_item FK target is visible
    existing = set(inspect(engine).get_table_names())
    if "campaign_item" not in existing:
        models.CampaignItem.__table__.create(bind=engine)
        created.append("campaign_item")
    else:
        print("Table already exists: campaign_item")

    if created:
        print(f"Created table(s): {', '.join(created)}")
    print("Migration complete.")


if __name__ == "__main__":
    migrate()
