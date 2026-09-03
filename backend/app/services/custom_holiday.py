"""
User-created calendar holidays (workspace-wide).
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.database.db import engine
from app.database.models import CustomHoliday
from app.utils.logger import logger

_TABLE_READY = False


def ensure_custom_holiday_table() -> None:
    """Create custom_holiday if missing (idempotent)."""
    global _TABLE_READY
    if _TABLE_READY:
        return
    try:
        inspector = inspect(engine)
        if CustomHoliday.__table__.name not in inspector.get_table_names():
            CustomHoliday.__table__.create(bind=engine)
            logger.info("Created table custom_holiday")
        _TABLE_READY = True
    except Exception as exc:
        logger.warning(f"Could not ensure custom_holiday table: {exc}")


def _row_dict(row: CustomHoliday) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "date": row.date,
        "note": row.note,
        "created_by": row.created_by,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


class CustomHolidayService:
    def __init__(self, db: Session):
        ensure_custom_holiday_table()
        self.db = db

    def list(
        self,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> list[dict[str, Any]]:
        query = self.db.query(CustomHoliday)
        if from_date is not None:
            query = query.filter(CustomHoliday.date >= from_date)
        if to_date is not None:
            query = query.filter(CustomHoliday.date <= to_date)
        rows = query.order_by(CustomHoliday.date.asc(), CustomHoliday.id.asc()).all()
        return [_row_dict(row) for row in rows]

    def create(
        self,
        *,
        name: str,
        occurred_on: date,
        note: Optional[str],
        created_by: Optional[str],
    ) -> dict[str, Any]:
        row = CustomHoliday(
            name=name,
            date=occurred_on,
            note=note,
            created_by=created_by,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return _row_dict(row)

    def update(self, holiday_id: int, patch: dict[str, Any]) -> dict[str, Any]:
        row = self.db.query(CustomHoliday).filter(CustomHoliday.id == holiday_id).first()
        if not row:
            raise KeyError(holiday_id)
        if "name" in patch and patch["name"] is not None:
            row.name = patch["name"]
        if "date" in patch and patch["date"] is not None:
            row.date = patch["date"]
        if "note" in patch:
            row.note = patch["note"]
        self.db.commit()
        self.db.refresh(row)
        return _row_dict(row)

    def delete(self, holiday_id: int) -> None:
        row = self.db.query(CustomHoliday).filter(CustomHoliday.id == holiday_id).first()
        if not row:
            raise KeyError(holiday_id)
        self.db.delete(row)
        self.db.commit()
