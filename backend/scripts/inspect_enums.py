"""Quick helper: print the labels of the poststatus / contentstatus enums."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text

from app.database.db import engine


def labels(conn, typename: str):
    rows = conn.execute(
        text(
            "SELECT e.enumlabel FROM pg_enum e "
            "JOIN pg_type t ON e.enumtypid = t.oid "
            "WHERE t.typname = :t ORDER BY e.enumsortorder"
        ),
        {"t": typename},
    ).fetchall()
    return [r[0] for r in rows]


if __name__ == "__main__":
    with engine.connect() as conn:
        for typ in ("poststatus", "contentstatus", "contentplatform", "mediatype"):
            print(f"{typ}: {labels(conn, typ)}")
