"""
API Routes - Content Calendar / Post Scheduling

GET    /calendar/events            - List scheduled events (optional date range)
POST   /calendar/events            - Schedule content for future publishing
GET    /calendar/events/{id}       - Get a single scheduled event
PUT    /calendar/events/{id}       - Update / reschedule an event
DELETE /calendar/events/{id}       - Delete an event
POST   /calendar/events/{id}/publish-now - Publish a scheduled event immediately
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventResponse,
    CalendarEventUpdate,
)
from app.services.calendar import CalendarService
from app.utils.logger import logger

router = APIRouter()


@router.get("/calendar/events", response_model=list[CalendarEventResponse])
async def get_calendar_events(
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


@router.post("/calendar/events", response_model=CalendarEventResponse)
async def create_calendar_event(
    request: CalendarEventCreate,
    db: Session = Depends(get_db),
):
    """Schedule a piece of content to be auto-published at a future time."""
    try:
        service = CalendarService(db)
        event = service.create_event(request)
        return service.to_response_dict(event)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Calendar create error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to schedule content: {e}")


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
    service = CalendarService(db)
    deleted = service.delete_event(event_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    return {"message": f"Event {event_id} deleted successfully"}


@router.post("/calendar/events/{event_id}/publish-now", response_model=CalendarEventResponse)
async def publish_event_now(
    event_id: int,
    db: Session = Depends(get_db),
):
    """Publish a scheduled event immediately instead of waiting for its time."""
    from app.services.scheduler import publish_event

    service = CalendarService(db)
    event = service.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    publish_event(db, event)
    db.refresh(event)
    return service.to_response_dict(event)
