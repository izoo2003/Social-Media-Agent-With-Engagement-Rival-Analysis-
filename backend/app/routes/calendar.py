"""
API Routes - Content Calendar / Post Scheduling

GET    /calendar/events            - List scheduled events (optional date range)
POST   /calendar/events            - Schedule content for future publishing
GET    /calendar/events/{id}       - Get a single scheduled event
PUT    /calendar/events/{id}       - Update / reschedule an event
DELETE /calendar/events/{id}       - Delete an event
POST   /calendar/events/{id}/publish-now - Publish a scheduled event immediately
GET    /calendar/holidays          - List user-created holidays
POST   /calendar/holidays          - Add a custom holiday
PATCH  /calendar/holidays/{id}     - Update a custom holiday
DELETE /calendar/holidays/{id}     - Delete a custom holiday
"""

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_db
from app.middleware.rate_limiter import limiter
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventResponse,
    CalendarEventUpdate,
    CustomHolidayCreate,
    CustomHolidayResponse,
    CustomHolidayUpdate,
)
from app.services import auth_service
from app.services.calendar import CalendarService
from app.services.custom_holiday import CustomHolidayService
from app.utils.logger import logger
from app.utils.sanitize import safe_error_detail

router = APIRouter()


def _optional_user(request: Request) -> str:
    if getattr(request.state, "dashboard_user", None):
        return str(request.state.dashboard_user)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = auth_service.decode_access_token(auth[7:].strip())
        if payload and payload.get("sub"):
            return str(payload["sub"])
    return "system"


@router.get("/calendar/events", response_model=list[CalendarEventResponse])
def get_calendar_events(
    start_date: Optional[datetime] = Query(
        None, description="Filter events scheduled on/after this UTC datetime"
    ),
    end_date: Optional[datetime] = Query(
        None, description="Filter events scheduled on/before this UTC datetime"
    ),
    status: Optional[str] = Query(None, description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Fetch scheduled content calendar events, enriched with content details."""
    try:
        service = CalendarService(db)
        events = service.list_events(
            start_date=start_date,
            end_date=end_date,
            status=status,
            skip=skip,
            limit=limit,
        )
        return [service.to_response_dict(e) for e in events]
    except Exception as e:
        logger.error(f"Calendar list error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch events: {e}")


@router.get("/calendar/holidays", response_model=list[CustomHolidayResponse])
def list_custom_holidays(
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
):
    """User-created holidays for the calendar (workspace-wide)."""
    try:
        return CustomHolidayService(db).list(from_date, to_date)
    except Exception as e:
        logger.error(f"Custom holiday list error: {e}")
        raise HTTPException(status_code=500, detail="Failed to load holidays")


@router.post("/calendar/holidays", response_model=CustomHolidayResponse)
@limiter.limit("30/minute")
def create_custom_holiday(
    request: Request,
    body: CustomHolidayCreate,
    db: Session = Depends(get_db),
):
    try:
        return CustomHolidayService(db).create(
            name=body.name,
            occurred_on=body.date,
            note=body.note,
            created_by=_optional_user(request),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Custom holiday create error: {e}")
        raise HTTPException(status_code=500, detail="Failed to add holiday")


@router.patch("/calendar/holidays/{holiday_id}", response_model=CustomHolidayResponse)
def update_custom_holiday(
    holiday_id: int,
    body: CustomHolidayUpdate,
    db: Session = Depends(get_db),
):
    try:
        return CustomHolidayService(db).update(
            holiday_id,
            body.model_dump(exclude_unset=True),
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Holiday not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Custom holiday update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update holiday")


@router.delete("/calendar/holidays/{holiday_id}")
def delete_custom_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
):
    try:
        CustomHolidayService(db).delete(holiday_id)
        return {"ok": True}
    except KeyError:
        raise HTTPException(status_code=404, detail="Holiday not found")
    except Exception as e:
        logger.error(f"Custom holiday delete error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete holiday")


@router.post("/calendar/events", response_model=CalendarEventResponse)
@limiter.limit("30/minute")
async def create_calendar_event(
    request: Request,
    body: CalendarEventCreate,
    db: Session = Depends(get_db),
):
    """Schedule a piece of content to be auto-published at a future time."""
    try:
        service = CalendarService(db)
        event = service.create_event(body)
        return service.to_response_dict(event)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Calendar create error: {e}")
        raise HTTPException(status_code=500, detail=safe_error_detail(e, "Failed to schedule content"))


@router.get("/calendar/events/{event_id}", response_model=CalendarEventResponse)
async def get_calendar_event(
    event_id: int,
    db: Session = Depends(get_db),
):
    """Get a single scheduled event."""
    service = CalendarService(db)
    event = service.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    return service.to_response_dict(event)


@router.put("/calendar/events/{event_id}", response_model=CalendarEventResponse)
async def update_calendar_event(
    event_id: int,
    request: CalendarEventUpdate,
    db: Session = Depends(get_db),
):
    """Update or reschedule a calendar event."""
    try:
        service = CalendarService(db)
        event = service.update_event(event_id, request)
        if not event:
            raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
        return service.to_response_dict(event)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Calendar update error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update event: {e}")


@router.delete("/calendar/events/{event_id}")
async def delete_calendar_event(
    event_id: int,
    db: Session = Depends(get_db),
):
    """Delete a scheduled event."""
    try:
        service = CalendarService(db)
        deleted = service.delete_event(event_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
        return {"message": f"Event {event_id} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Calendar delete error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=safe_error_detail(e, "Failed to delete scheduled event"),
        )


@router.post("/calendar/events/{event_id}/publish-now", response_model=CalendarEventResponse)
@limiter.limit("10/minute")
async def publish_event_now(
    request: Request,
    event_id: int,
    designer_pin: str = Query(default="", description="Designer PIN (required when APPROVAL_REQUIRED=True)"),
    db: Session = Depends(get_db),
):
    """
    Publish a scheduled event immediately instead of waiting for its time.

    When APPROVAL_REQUIRED is enabled this endpoint requires the designer PIN
    to prevent the approval workflow from being bypassed via the scheduler.
    """
    import secrets as _secrets

    if settings.APPROVAL_REQUIRED:
        if not settings.DESIGNER_PIN:
            raise HTTPException(
                status_code=503,
                detail="Publish-now is disabled: DESIGNER_PIN is not configured.",
            )
        if not _secrets.compare_digest(str(designer_pin), str(settings.DESIGNER_PIN)):
            raise HTTPException(
                status_code=403,
                detail="Designer PIN required to publish immediately.",
            )

    from app.services.scheduler import publish_event

    service = CalendarService(db)
    event = service.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    publish_event(db, event)
    db.refresh(event)
    return service.to_response_dict(event)
