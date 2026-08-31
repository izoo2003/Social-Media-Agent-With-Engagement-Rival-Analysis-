"""
Designer KPI Creation — auto aggregation + manual/custom CRUD.

Day boundaries use Asia/Karachi so "today" matches the designer.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import inspect, or_
from sqlalchemy.orm import Session, joinedload

from app.database.db import SessionLocal, engine
from app.database.models import (
    CalendarEvent,
    Campaign,
    Content,
    ContentStatus,
    KpiAutoEvent,
    KpiCustomDefinition,
    KpiManualEntry,
    KpiMetricKey,
    MediaType,
    PostStatus,
    Rival,
    ScheduleStatus,
)
from app.utils.logger import logger

PKT = ZoneInfo("Asia/Karachi")
KPI_TZ = "Asia/Karachi"
KPI_KIND_CUSTOM = "custom"
KPI_KIND_WEBSITE = "website_maintenance"
VALID_KPI_CARD_KINDS = {KPI_KIND_CUSTOM, KPI_KIND_WEBSITE}

CATALOG: list[dict[str, str]] = [
    {
        "key": KpiMetricKey.POSTS_PUBLISHED.value,
        "label": "Posts published",
        "description": "Images and reels posted live through this agent",
    },
    {
        "key": KpiMetricKey.POSTS_SCHEDULED.value,
        "label": "Posts scheduled",
        "description": "Calendar events lined up for auto-publish",
    },
    {
        "key": KpiMetricKey.IMAGES_GENERATED.value,
        "label": "Images generated",
        "description": "Product images created in Prompt Studio",
    },
    {
        "key": KpiMetricKey.VOICEOVERS_GENERATED.value,
        "label": "Voiceovers generated",
        "description": "Voice-overs generated in Prompt Studio",
    },
    {
        "key": KpiMetricKey.SCRIPTS_GENERATED.value,
        "label": "Scripts generated",
        "description": "Scripts and write-prompts generated in Prompt Studio",
    },
    {
        "key": KpiMetricKey.CAMPAIGNS_STARTED.value,
        "label": "Campaigns started",
        "description": "Campaign plans created in this agent",
    },
    {
        "key": KpiMetricKey.RIVALS_ADDED.value,
        "label": "Rivals added",
        "description": "Competitors added in Rival Review",
    },
]

CATALOG_KEYS = {item["key"] for item in CATALOG}
AUTO_EVENT_KEYS = {
    KpiMetricKey.IMAGES_GENERATED.value,
    KpiMetricKey.VOICEOVERS_GENERATED.value,
    KpiMetricKey.SCRIPTS_GENERATED.value,
}

_PUBLISHED_POST_STATUS_VALUES = (PostStatus.PUBLISHED, PostStatus.PARTIAL)
_PUBLISHED_POST_STATUS_SET = set(_PUBLISHED_POST_STATUS_VALUES)
_TABLES_READY = False


def pkt_today() -> date:
    return datetime.now(PKT).date()


def utc_to_pkt_date(dt: Optional[datetime]) -> Optional[date]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(PKT).date()


def range_bounds_utc(from_date: date, to_date: date) -> tuple[datetime, datetime]:
    """Inclusive PKT date range as naive-UTC [start, end)."""
    start = datetime(from_date.year, from_date.month, from_date.day, tzinfo=PKT)
    end = datetime(to_date.year, to_date.month, to_date.day, tzinfo=PKT) + timedelta(days=1)
    return (
        start.astimezone(timezone.utc).replace(tzinfo=None),
        end.astimezone(timezone.utc).replace(tzinfo=None),
    )


def iter_dates(from_date: date, to_date: date):
    current = from_date
    while current <= to_date:
        yield current
        current += timedelta(days=1)


def _empty_counts() -> dict[str, int]:
    return {"auto": 0, "manual": 0, "total": 0}


def _add_auto(bucket: dict[str, int], amount: int) -> None:
    bucket["auto"] += amount
    bucket["total"] += amount


def _add_manual(bucket: dict[str, int], amount: int) -> None:
    bucket["manual"] += amount
    bucket["total"] += amount


def _ensure_kpi_card_kind_column() -> None:
    """Add kind on kpi_custom_definition when upgrading an older database."""
    try:
        inspector = inspect(engine)
        if "kpi_custom_definition" not in inspector.get_table_names():
            return
        columns = {col["name"] for col in inspector.get_columns("kpi_custom_definition")}
        if "kind" in columns:
            return
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "ALTER TABLE kpi_custom_definition "
                "ADD COLUMN kind VARCHAR(40) DEFAULT 'custom' NOT NULL"
            )
        logger.info("Added kpi_custom_definition.kind")
    except Exception as exc:
        logger.warning(f"Could not add kpi_custom_definition.kind: {exc}")


def ensure_kpi_tables() -> None:
    """Create KPI tables if missing (idempotent)."""
    global _TABLES_READY
    if _TABLES_READY:
        return
    try:
        inspector = inspect(engine)
        existing = set(inspector.get_table_names())
        ordered = (
            KpiCustomDefinition.__table__,
            KpiAutoEvent.__table__,
            KpiManualEntry.__table__,
        )
        for table in ordered:
            if table.name not in existing:
                table.create(bind=engine)
                logger.info(f"Created KPI table {table.name}")
        _ensure_kpi_card_kind_column()
        _TABLES_READY = True
    except Exception as exc:
        logger.warning(f"Could not ensure KPI tables: {exc}")


def record_auto_event(
    metric_key: str,
    *,
    quantity: int = 1,
    created_by: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
) -> None:
    """
    Persist one auto KPI event. Never raises — generation endpoints must not fail
    because logging failed.
    """
    if metric_key not in AUTO_EVENT_KEYS:
        return
    try:
        ensure_kpi_tables()
        db = SessionLocal()
        try:
            db.add(
                KpiAutoEvent(
                    metric_key=metric_key,
                    quantity=max(1, int(quantity)),
                    occurred_at=datetime.utcnow(),
                    created_by=(created_by or "").strip() or None,
                    meta_data=meta,
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        logger.warning(f"KPI auto event log failed ({metric_key}): {exc}")


def _content_is_published(row: Content) -> bool:
    if row.status == ContentStatus.PUBLISHED:
        return True
    for attr in (
        "linkedin_post_status",
        "facebook_post_status",
        "instagram_post_status",
        "youtube_post_status",
        "tiktok_post_status",
    ):
        if getattr(row, attr, None) in _PUBLISHED_POST_STATUS_SET:
            return True
    return False


def _published_at(row: Content) -> Optional[datetime]:
    latest: Optional[datetime] = None
    for event in row.calendar_events or []:
        if event.published_at and (latest is None or event.published_at > latest):
            latest = event.published_at
    if latest is not None:
        return latest
    return row.updated_at or row.created_at


def _media_bucket(media_type: Optional[MediaType]) -> Optional[str]:
    if media_type == MediaType.IMAGE:
        return "image"
    if media_type == MediaType.VIDEO:
        return "video"
    return None


class KpiService:
    def __init__(self, db: Session):
        self.db = db

    def catalog(self) -> list[dict[str, str]]:
        return list(CATALOG)

    def get_summary(self, from_date: date, to_date: date) -> dict[str, Any]:
        if to_date < from_date:
            raise ValueError("to date must be on or after from date")
        if (to_date - from_date).days > 366:
            raise ValueError("Date range cannot exceed 366 days")

        ensure_kpi_tables()
        start_utc, end_utc = range_bounds_utc(from_date, to_date)

        catalog_totals: dict[str, dict[str, int]] = {
            item["key"]: _empty_counts() for item in CATALOG
        }
        daily: dict[date, dict[str, Any]] = {}
        for day in iter_dates(from_date, to_date):
            daily[day] = {
                "catalog": {key: _empty_counts() for key in CATALOG_KEYS},
                "custom": {},
                "breakdown": defaultdict(int),
            }

        published_breakdown = {"image": 0, "video": 0}
        self._accumulate_published(
            from_date,
            to_date,
            catalog_totals,
            daily,
            published_breakdown,
        )
        self._accumulate_scheduled(start_utc, end_utc, catalog_totals, daily)
        self._accumulate_campaigns(start_utc, end_utc, catalog_totals, daily)
        self._accumulate_rivals(start_utc, end_utc, catalog_totals, daily)
        self._accumulate_auto_events(start_utc, end_utc, catalog_totals, daily)

        custom_defs = (
            self.db.query(KpiCustomDefinition)
            .order_by(KpiCustomDefinition.created_at.asc())
            .all()
        )
        custom_totals: dict[int, dict[str, int]] = {
            d.id: _empty_counts() for d in custom_defs if d.is_active
        }

        entries = (
            self.db.query(KpiManualEntry)
            .options(joinedload(KpiManualEntry.custom_definition))
            .filter(
                KpiManualEntry.occurred_on >= from_date,
                KpiManualEntry.occurred_on <= to_date,
            )
            .order_by(KpiManualEntry.occurred_on.desc(), KpiManualEntry.id.desc())
            .all()
        )

        for entry in entries:
            day_row = daily.get(entry.occurred_on)
            if entry.custom_definition_id:
                cid = entry.custom_definition_id
                if cid not in custom_totals:
                    if entry.custom_definition and not entry.custom_definition.is_active:
                        continue
                    custom_totals[cid] = _empty_counts()
                _add_manual(custom_totals[cid], entry.quantity)
                if day_row is not None:
                    if cid not in day_row["custom"]:
                        day_row["custom"][cid] = _empty_counts()
                    _add_manual(day_row["custom"][cid], entry.quantity)
                continue
            key = entry.metric_key or ""
            if key not in CATALOG_KEYS:
                continue
            _add_manual(catalog_totals[key], entry.quantity)
            if day_row is not None:
                _add_manual(day_row["catalog"][key], entry.quantity)

        catalog_out = []
        for item in CATALOG:
            payload = {
                "key": item["key"],
                "label": item["label"],
                "description": item["description"],
                **catalog_totals[item["key"]],
            }
            if item["key"] == KpiMetricKey.POSTS_PUBLISHED.value:
                payload["breakdown"] = dict(published_breakdown)
            catalog_out.append(payload)

        custom_out = []
        for d in custom_defs:
            if not d.is_active:
                continue
            counts = custom_totals.get(d.id, _empty_counts())
            custom_out.append(
                {
                    "id": d.id,
                    "name": d.name,
                    "kind": getattr(d, "kind", None) or "custom",
                    "is_active": True,
                    **counts,
                }
            )

        daily_out = []
        for day in iter_dates(from_date, to_date):
            row = daily[day]
            catalog_day = {}
            for key in CATALOG_KEYS:
                cell = dict(row["catalog"][key])
                if key == KpiMetricKey.POSTS_PUBLISHED.value:
                    cell["breakdown"] = {
                        "image": row["breakdown"].get("image", 0),
                        "video": row["breakdown"].get("video", 0),
                    }
                catalog_day[key] = cell
            custom_day = {
                str(cid): counts for cid, counts in row["custom"].items()
            }
            daily_out.append(
                {
                    "date": day,
                    "catalog": catalog_day,
                    "custom": custom_day,
                }
            )

        return {
            "from": from_date,
            "to": to_date,
            "timezone": KPI_TZ,
            "catalog": catalog_out,
            "custom": custom_out,
            "daily": daily_out,
            "manual_entries": [self._entry_dict(e) for e in entries],
        }

    def list_published_posts(
        self,
        from_date: date,
        to_date: date,
        *,
        limit: int = 12,
    ) -> list[dict[str, Any]]:
        """Recent published posts in the PKT date range, newest first."""
        rows = (
            self.db.query(Content)
            .options(joinedload(Content.calendar_events))
            .filter(
                or_(
                    Content.status == ContentStatus.PUBLISHED,
                    Content.linkedin_post_status.in_(_PUBLISHED_POST_STATUS_VALUES),
                    Content.facebook_post_status.in_(_PUBLISHED_POST_STATUS_VALUES),
                    Content.instagram_post_status.in_(_PUBLISHED_POST_STATUS_VALUES),
                    Content.youtube_post_status.in_(_PUBLISHED_POST_STATUS_VALUES),
                    Content.tiktok_post_status.in_(_PUBLISHED_POST_STATUS_VALUES),
                )
            )
            .all()
        )
        items: list[dict[str, Any]] = []
        for row in rows:
            if not _content_is_published(row):
                continue
            occurred = utc_to_pkt_date(_published_at(row))
            if occurred is None or occurred < from_date or occurred > to_date:
                continue
            media = row.media_type.value if row.media_type else None
            body = (row.body or "").strip()
            items.append(
                {
                    "id": row.id,
                    "title": row.title or "",
                    "body_preview": body[:280],
                    "platform": row.platform.value if row.platform else None,
                    "media_type": media,
                    "media_path": row.media_path,
                    "occurred_on": occurred.isoformat(),
                }
            )
        items.sort(key=lambda p: p["occurred_on"], reverse=True)
        return items[:limit]

    def _accumulate_published(
        self,
        from_date: date,
        to_date: date,
        catalog_totals: dict[str, dict[str, int]],
        daily: dict[date, dict[str, Any]],
        published_breakdown: dict[str, int],
    ) -> None:
        key = KpiMetricKey.POSTS_PUBLISHED.value
        rows = (
            self.db.query(Content)
            .options(joinedload(Content.calendar_events))
            .filter(
                or_(
                    Content.status == ContentStatus.PUBLISHED,
                    Content.linkedin_post_status.in_(_PUBLISHED_POST_STATUS_VALUES),
                    Content.facebook_post_status.in_(_PUBLISHED_POST_STATUS_VALUES),
                    Content.instagram_post_status.in_(_PUBLISHED_POST_STATUS_VALUES),
                    Content.youtube_post_status.in_(_PUBLISHED_POST_STATUS_VALUES),
                    Content.tiktok_post_status.in_(_PUBLISHED_POST_STATUS_VALUES),
                )
            )
            .all()
        )
        for row in rows:
            if not _content_is_published(row):
                continue
            occurred = utc_to_pkt_date(_published_at(row))
            if occurred is None or occurred < from_date or occurred > to_date:
                continue
            _add_auto(catalog_totals[key], 1)
            _add_auto(daily[occurred]["catalog"][key], 1)
            bucket = _media_bucket(row.media_type)
            if bucket:
                published_breakdown[bucket] += 1
                daily[occurred]["breakdown"][bucket] += 1

    def _accumulate_scheduled(
        self,
        start_utc: datetime,
        end_utc: datetime,
        catalog_totals: dict[str, dict[str, int]],
        daily: dict[date, dict[str, Any]],
    ) -> None:
        key = KpiMetricKey.POSTS_SCHEDULED.value
        rows = (
            self.db.query(CalendarEvent)
            .filter(
                CalendarEvent.created_at >= start_utc,
                CalendarEvent.created_at < end_utc,
                CalendarEvent.status != ScheduleStatus.CANCELLED.value,
            )
            .all()
        )
        for row in rows:
            occurred = utc_to_pkt_date(row.created_at)
            if occurred is None or occurred not in daily:
                continue
            _add_auto(catalog_totals[key], 1)
            _add_auto(daily[occurred]["catalog"][key], 1)

    def _accumulate_campaigns(
        self,
        start_utc: datetime,
        end_utc: datetime,
        catalog_totals: dict[str, dict[str, int]],
        daily: dict[date, dict[str, Any]],
    ) -> None:
        key = KpiMetricKey.CAMPAIGNS_STARTED.value
        rows = (
            self.db.query(Campaign)
            .filter(
                Campaign.created_at >= start_utc,
                Campaign.created_at < end_utc,
            )
            .all()
        )
        for row in rows:
            occurred = utc_to_pkt_date(row.created_at)
            if occurred is None or occurred not in daily:
                continue
            _add_auto(catalog_totals[key], 1)
            _add_auto(daily[occurred]["catalog"][key], 1)

    def _accumulate_rivals(
        self,
        start_utc: datetime,
        end_utc: datetime,
        catalog_totals: dict[str, dict[str, int]],
        daily: dict[date, dict[str, Any]],
    ) -> None:
        key = KpiMetricKey.RIVALS_ADDED.value
        rows = (
            self.db.query(Rival)
            .filter(
                Rival.created_at >= start_utc,
                Rival.created_at < end_utc,
            )
            .all()
        )
        for row in rows:
            occurred = utc_to_pkt_date(row.created_at)
            if occurred is None or occurred not in daily:
                continue
            _add_auto(catalog_totals[key], 1)
            _add_auto(daily[occurred]["catalog"][key], 1)

    def _accumulate_auto_events(
        self,
        start_utc: datetime,
        end_utc: datetime,
        catalog_totals: dict[str, dict[str, int]],
        daily: dict[date, dict[str, Any]],
    ) -> None:
        rows = (
            self.db.query(KpiAutoEvent)
            .filter(
                KpiAutoEvent.occurred_at >= start_utc,
                KpiAutoEvent.occurred_at < end_utc,
                KpiAutoEvent.metric_key.in_(AUTO_EVENT_KEYS),
            )
            .all()
        )
        for row in rows:
            key = row.metric_key
            if key not in CATALOG_KEYS:
                continue
            occurred = utc_to_pkt_date(row.occurred_at)
            if occurred is None or occurred not in daily:
                continue
            qty = row.quantity or 1
            _add_auto(catalog_totals[key], qty)
            _add_auto(daily[occurred]["catalog"][key], qty)

    def create_manual(
        self,
        *,
        metric_key: Optional[str],
        custom_definition_id: Optional[int],
        quantity: int,
        note: Optional[str],
        occurred_on: date,
        created_by: Optional[str],
    ) -> KpiManualEntry:
        ensure_kpi_tables()
        if metric_key:
            if metric_key not in CATALOG_KEYS:
                raise ValueError(f"Unknown catalog metric: {metric_key}")
            custom_definition_id = None
        else:
            definition = self.db.query(KpiCustomDefinition).filter(
                KpiCustomDefinition.id == custom_definition_id,
                KpiCustomDefinition.is_active.is_(True),
            ).first()
            if not definition:
                raise ValueError("Custom KPI not found")
            metric_key = None

        entry = KpiManualEntry(
            metric_key=metric_key,
            custom_definition_id=custom_definition_id,
            quantity=quantity,
            note=note,
            occurred_on=occurred_on,
            created_by=(created_by or "").strip() or None,
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def update_manual(self, entry_id: int, patch: dict[str, Any]) -> KpiManualEntry:
        entry = self.db.query(KpiManualEntry).filter(KpiManualEntry.id == entry_id).first()
        if not entry:
            raise KeyError("Manual entry not found")

        if "metric_key" in patch or "custom_definition_id" in patch:
            new_key = patch.get("metric_key", entry.metric_key)
            new_custom = patch.get("custom_definition_id", entry.custom_definition_id)
            has_key = bool(new_key)
            has_custom = new_custom is not None
            if has_key == has_custom:
                raise ValueError("Provide either metric_key or custom_definition_id, not both.")
            if has_key:
                if new_key not in CATALOG_KEYS:
                    raise ValueError(f"Unknown catalog metric: {new_key}")
                entry.metric_key = new_key
                entry.custom_definition_id = None
            else:
                definition = self.db.query(KpiCustomDefinition).filter(
                    KpiCustomDefinition.id == new_custom,
                    KpiCustomDefinition.is_active.is_(True),
                ).first()
                if not definition:
                    raise ValueError("Custom KPI not found")
                entry.metric_key = None
                entry.custom_definition_id = new_custom

        if "quantity" in patch and patch["quantity"] is not None:
            entry.quantity = patch["quantity"]
        if "note" in patch:
            entry.note = patch["note"]
        if "occurred_on" in patch and patch["occurred_on"] is not None:
            entry.occurred_on = patch["occurred_on"]

        self.db.commit()
        self.db.refresh(entry)
        return entry

    def delete_manual(self, entry_id: int) -> None:
        entry = self.db.query(KpiManualEntry).filter(KpiManualEntry.id == entry_id).first()
        if not entry:
            raise KeyError("Manual entry not found")
        self.db.delete(entry)
        self.db.commit()

    def create_custom(self, name: str, kind: str = "custom") -> KpiCustomDefinition:
        ensure_kpi_tables()
        cleaned_kind = (kind or "custom").strip().lower()
        if cleaned_kind not in VALID_KPI_CARD_KINDS:
            raise ValueError("Invalid KPI card type. Use custom or website_maintenance.")
        definition = KpiCustomDefinition(name=name, kind=cleaned_kind, is_active=True)
        self.db.add(definition)
        self.db.commit()
        self.db.refresh(definition)
        return definition

    def update_custom(self, definition_id: int, *, name: Optional[str], is_active: Optional[bool]) -> KpiCustomDefinition:
        definition = (
            self.db.query(KpiCustomDefinition)
            .filter(KpiCustomDefinition.id == definition_id)
            .first()
        )
        if not definition:
            raise KeyError("Custom KPI not found")
        if name is not None:
            definition.name = name
        if is_active is not None:
            definition.is_active = is_active
        self.db.commit()
        self.db.refresh(definition)
        return definition

    def archive_custom(self, definition_id: int) -> KpiCustomDefinition:
        return self.update_custom(definition_id, name=None, is_active=False)

    def _entry_dict(self, entry: KpiManualEntry) -> dict[str, Any]:
        custom_name = None
        custom_kind = None
        if entry.custom_definition is not None:
            custom_name = entry.custom_definition.name
            custom_kind = getattr(entry.custom_definition, "kind", None) or "custom"
        return {
            "id": entry.id,
            "metric_key": entry.metric_key,
            "custom_definition_id": entry.custom_definition_id,
            "custom_name": custom_name,
            "custom_kind": custom_kind,
            "quantity": entry.quantity,
            "note": entry.note,
            "occurred_on": entry.occurred_on,
            "created_by": entry.created_by,
            "created_at": entry.created_at,
        }
