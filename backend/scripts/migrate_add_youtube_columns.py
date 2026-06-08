"""
Add YouTube posting columns to the content table (if missing).
Run once after pulling YouTube integration changes.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import inspect, text

from app.database.db import engine


def migrate():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("content")}

    with engine.begin() as conn:
        if "youtube_post_id" not in columns:
            conn.execute(
                text("ALTER TABLE content ADD COLUMN youtube_post_id VARCHAR(255)")
            )
            print("Added column: youtube_post_id")
        else:
            print("Column already exists: youtube_post_id")

        if "youtube_post_status" not in columns:
            conn.execute(
                text(
                    "ALTER TABLE content ADD COLUMN youtube_post_status VARCHAR(9) "
                    "DEFAULT 'PENDING'"
                )
            )
            print("Added column: youtube_post_status")
        else:
            print("Column already exists: youtube_post_status")

    print("Migration complete.")


if __name__ == "__main__":
    migrate()
