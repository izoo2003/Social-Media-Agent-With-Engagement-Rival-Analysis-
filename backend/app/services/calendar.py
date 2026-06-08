"""
Calendar / Scheduling Service
CRUD for scheduled posts plus the queries the background worker relies on.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.database.models import (
    CalendarEvent,
    Content,
    ContentStatus,
    ScheduleStatus,
)
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate
from app.services.media import MediaService
from app.utils.logger import logger

media_service = MediaService()


def to_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Normalize an incoming datetime to naive UTC for storage.

    The frontend sends ISO strings with an offset (e.g. '...Z' or '+05:00'),
    which Pydantic parses into a timezone-aware datetime. We store everything
    as naive UTC so it lines up with the worker's datetime.utcnow() comparison.
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def as_aware_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Mark a stored naive-UTC datetime as timezone-aware UTC for API output, so
    the JSON includes an offset and the browser renders it in local time.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class CalendarService:
    """Manage scheduled content calendar events."""

    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------ CRUD

    def create_event(self, data: CalendarEventCreate) -> CalendarEvent:
        """Schedule a piece of content for future publishing."""
        content = self.db.query(Content).filter(Content.id == data.content_id).first()
        if not content:
            raise ValueError(f"Content {data.content_id} not found")

        if not data.platforms:
            raise ValueError("At least one platform is required to schedule a post")

        event = CalendarEvent(
            content_id=data.content_id,
            scheduled_date=to_naive_utc(data.scheduled_date),
            status=ScheduleStatus.PENDING.value,
            platforms=[p.value for p in data.platforms],
            draft_mode=data.draft_mode,
            override_title=data.override_title,
            override_body=data.override_body,
            linkedin_account_labels=data.linkedin_account_labels,
            notes=data.notes,
        )
        self.db.add(event)

        # Reflect scheduling on the content record
        content.status = ContentStatus.SCHEDULED
        content.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(event)
        logger.info(
            f"Scheduled content {data.content_id} -> event {event.id} "
            f"at {data.scheduled_date} for {event.platforms}"
        )
        return event

    def list_events(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 200,
    ) -> list[CalendarEvent]:
        """List scheduled events, optionally filtered by date range / status."""
        query = self.db.query(CalendarEvent)

        start_date = to_naive_utc(start_date)
        end_date = to_naive_utc(end_date)

        if start_date is not None:
            query = query.filter(CalendarEvent.scheduled_date >= start_date)
        if end_date is not None:
            query = query.filter(CalendarEvent.scheduled_date <= end_date)
        if status:
            query = query.filter(CalendarEvent.status == status)

        return (
            query.order_by(CalendarEvent.scheduled_date.asc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_event(self, event_id: int) -> Optional[CalendarEvent]:
        return self.db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()

    def update_event(
        self, event_id: int, data: CalendarEventUpdate
    ) -> Optional[CalendarEvent]:
        """Update / reschedule an event. Returns None if not found."""
        event = self.get_event(event_id)
        if not event:
            return None

        if data.scheduled_date is not None:
            event.scheduled_date = to_naive_utc(data.scheduled_date)
        if data.platforms is not None:
            event.platforms = [p.value for p in data.platforms]
        if data.draft_mode is not None:
            event.draft_mode = data.draft_mode
        if data.override_title is not None:
            event.override_title = data.override_title
        if data.override_body is not None:
            event.override_body = data.override_body
        if data.linkedin_account_labels is not None:
            event.linkedin_account_labels = data.linkedin_account_labels
        if data.notes is not None:
            event.notes = data.notes
        if data.status is not None:
            event.status = data.status
            # Re-enabling a previously failed/cancelled event clears the error
            if data.status == ScheduleStatus.PENDING.value:
                event.error_message = None

        event.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(event)
        logger.info(f"Updated calendar event {event_id}")
        return event

    def delete_event(self, event_id: int) -> bool:
        event = self.get_event(event_id)
        if not event:
            return False
        self.db.delete(event)
        self.db.commit()
        logger.info(f"Deleted calendar event {event_id}")
        return True

    # --------------------------------------------------------------- Worker

    def get_due_events(self, now: Optional[datetime] = None) -> list[CalendarEvent]:
        """
        Return pending events whose scheduled time has arrived (UTC).
        Used by the background scheduler.
        """
        now = now or datetime.utcnow()
        return (
            self.db.query(CalendarEvent)
            .filter(
                CalendarEvent.status == ScheduleStatus.PENDING.value,
                CalendarEvent.scheduled_date <= now,
            )
            .order_by(CalendarEvent.scheduled_date.asc())
            .all()
        )

    # ------------------------------------------------------------ Rendering

    def to_response_dict(self, event: CalendarEvent) -> dict:
        """Enrich an event with its content details for the API response."""
        content = event.content

        media_url = None
        media_path = content.media_path if content else None
        media_type = None
        if content and content.media_path:
            media_type = content.media_type.value if content.media_type else None
            try:
                if media_service.is_supabase_configured:
                    media_url = media_service.get_public_url(content.media_path)
                else:
                    media_url = f"/uploads/{content.media_path}"
            except Exception:
                media_url = None

        return {
            "id": event.id,
            "content_id": event.content_id,
            "scheduled_date": as_aware_utc(event.scheduled_date),
            "status": event.status,
            "platforms": event.platforms or [],
            "draft_mode": bool(event.draft_mode),
            "override_title": event.override_title,
            "override_body": event.override_body,
            "linkedin_account_labels": event.linkedin_account_labels,
            "notes": event.notes,
            "published_at": as_aware_utc(event.published_at),
            "error_message": event.error_message,
            "results": event.results,
            "created_at": as_aware_utc(event.created_at),
            "updated_at": as_aware_utc(event.updated_at),
            "content_platform": content.platform.value if content and content.platform else None,
            "content_title": (event.override_title or (content.title if content else None)),
            "content_body": (event.override_body or (content.body if content else None)),
            "media_path": media_path,
            "media_type": media_type,
            "media_url": media_url,
        }
