"""Tests for user-created calendar holidays."""

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.db import Base
from app.schemas.calendar import CustomHolidayUpdate
from app.services.custom_holiday import CustomHolidayService


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setattr("app.services.custom_holiday.ensure_custom_holiday_table", lambda: None)
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_create_and_list_in_range(db):
    service = CustomHolidayService(db)
    service.create(
        name="Brand launch",
        occurred_on=date(2026, 9, 10),
        note="Post the new spice range",
        created_by="designer",
    )
    service.create(
        name="Out of range",
        occurred_on=date(2026, 12, 1),
        note=None,
        created_by="designer",
    )
    listed = service.list(date(2026, 9, 1), date(2026, 9, 30))
    assert len(listed) == 1
    assert listed[0]["name"] == "Brand launch"
    assert listed[0]["note"] == "Post the new spice range"


def test_update_and_delete(db):
    service = CustomHolidayService(db)
    created = service.create(
        name="Old name",
        occurred_on=date(2026, 9, 5),
        note=None,
        created_by="designer",
    )
    updated = service.update(created["id"], {"name": "New name", "note": "Prep a reel"})
    assert updated["name"] == "New name"
    assert updated["note"] == "Prep a reel"
    service.delete(created["id"])
    assert service.list() == []


def test_delete_missing_raises(db):
    service = CustomHolidayService(db)
    with pytest.raises(KeyError):
        service.delete(999)


def test_update_schema_accepts_date():
    parsed = CustomHolidayUpdate(name="New name", date="2026-09-08", note="Prep a reel")
    assert parsed.date == date(2026, 9, 8)
    assert parsed.name == "New name"
