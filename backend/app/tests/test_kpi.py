"""Tests for designer KPI Creation — catalog, PKT grouping, summary math, auth."""

from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.db import Base
from app.database.models import (
    KpiAutoEvent,
    KpiMetricKey,
)
from app.routes.kpi import _require_senior
from app.services.kpi import (
    AUTO_EVENT_KEYS,
    CATALOG_KEYS,
    KpiService,
    range_bounds_utc,
    utc_to_pkt_date,
)


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setattr("app.services.kpi.ensure_kpi_tables", lambda: None)
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_catalog_keys_cover_plan_metrics():
    expected = {
        "posts_published",
        "posts_scheduled",
        "images_generated",
        "voiceovers_generated",
        "scripts_generated",
        "campaigns_started",
        "rivals_added",
    }
    assert CATALOG_KEYS == expected
    assert AUTO_EVENT_KEYS == {
        "images_generated",
        "voiceovers_generated",
        "scripts_generated",
    }


def test_utc_to_pkt_date_crosses_midnight():
    # 20:00 UTC on 27 Aug is 01:00 PKT on 28 Aug.
    dt = datetime(2026, 8, 27, 20, 0, tzinfo=timezone.utc)
    assert utc_to_pkt_date(dt) == date(2026, 8, 28)


def test_range_bounds_utc_covers_full_pkt_day():
    start, end = range_bounds_utc(date(2026, 8, 28), date(2026, 8, 28))
    assert utc_to_pkt_date(start.replace(tzinfo=timezone.utc)) == date(2026, 8, 28)
    # end is exclusive — first instant of 29 Aug PKT
    assert utc_to_pkt_date(end.replace(tzinfo=timezone.utc)) == date(2026, 8, 29)


def test_require_senior_rejects_junior():
    _require_senior("senior")
    with pytest.raises(HTTPException) as exc:
        _require_senior("junior")
    assert exc.value.status_code == 403


def test_summary_adds_auto_and_manual(db):
    day = date(2026, 8, 28)
    start, end = range_bounds_utc(day, day)
    # Mid-day UTC is still 28 Aug PKT
    occurred = datetime(2026, 8, 28, 10, 0)

    db.add(
        KpiAutoEvent(
            metric_key=KpiMetricKey.IMAGES_GENERATED.value,
            quantity=2,
            occurred_at=occurred,
        )
    )
    db.commit()

    service = KpiService(db)
    service.create_manual(
        metric_key="images_generated",
        custom_definition_id=None,
        quantity=3,
        note="Canva",
        occurred_on=day,
        created_by="designer",
    )

    summary = service.get_summary(day, day)
    images = next(m for m in summary["catalog"] if m["key"] == "images_generated")
    assert images["auto"] == 2
    assert images["manual"] == 3
    assert images["total"] == 5

    daily = summary["daily"]
    assert len(daily) == 1
    assert daily[0]["catalog"]["images_generated"]["total"] == 5
    assert len(summary["manual_entries"]) == 1
    assert start < occurred < end


def test_custom_kpi_manual_only(db):
    day = date(2026, 8, 28)
    service = KpiService(db)
    custom = service.create_custom("Canva graphics")
    service.create_manual(
        metric_key=None,
        custom_definition_id=custom.id,
        quantity=4,
        note=None,
        occurred_on=day,
        created_by="designer",
    )

    summary = service.get_summary(day, day)
    assert len(summary["custom"]) == 1
    assert summary["custom"][0]["name"] == "Canva graphics"
    assert summary["custom"][0]["auto"] == 0
    assert summary["custom"][0]["manual"] == 4
    assert summary["custom"][0]["total"] == 4


def test_archive_hides_custom_card(db):
    day = date(2026, 8, 28)
    service = KpiService(db)
    custom = service.create_custom("Old card")
    service.create_manual(
        metric_key=None,
        custom_definition_id=custom.id,
        quantity=1,
        note=None,
        occurred_on=day,
        created_by="designer",
    )
    service.archive_custom(custom.id)
    summary = service.get_summary(day, day)
    assert summary["custom"] == []


def test_reject_unknown_catalog_key(db):
    service = KpiService(db)
    with pytest.raises(ValueError):
        service.create_manual(
            metric_key="not_a_metric",
            custom_definition_id=None,
            quantity=1,
            note=None,
            occurred_on=date(2026, 8, 28),
            created_by=None,
        )


def test_summary_rejects_inverted_range(db):
    service = KpiService(db)
    with pytest.raises(ValueError):
        service.get_summary(date(2026, 8, 28), date(2026, 8, 1))
