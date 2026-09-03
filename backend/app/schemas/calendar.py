"""
Pydantic Schemas - Content Calendar / Scheduling DTOs
"""

from datetime import date as Date
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.content import ContentPlatform


class CalendarEventCreate(BaseModel):
    """Request to schedule a piece of content for future publishing."""

    content_id: int = Field(..., description="ID of the content to schedule")
    scheduled_date: datetime = Field(
        ...,
        description="When to publish, as an ISO 8601 UTC datetime (e.g. 2026-06-10T14:30:00Z)",
    )
    platforms: list[ContentPlatform] = Field(
        ...,
        description="Platforms to publish to when the time arrives",
    )
    draft_mode: bool = Field(
        default=False,
        description="If True, simulates posting instead of publishing live",
    )
    override_title: Optional[str] = Field(default=None)
    override_body: Optional[str] = Field(default=None)
    linkedin_account_labels: Optional[list[str]] = Field(
        default=None,
        description="Optional subset of LinkedIn accounts to post from",
    )
    notes: Optional[str] = Field(default=None)


class CalendarEventUpdate(BaseModel):
    """Update / reschedule an existing calendar event."""

    scheduled_date: Optional[datetime] = None
    platforms: Optional[list[ContentPlatform]] = None
    draft_mode: Optional[bool] = None
    override_title: Optional[str] = None
    override_body: Optional[str] = None
    linkedin_account_labels: Optional[list[str]] = None
    notes: Optional[str] = None
    status: Optional[str] = Field(
        default=None,
        description="Set to 'cancelled' to cancel, or 'pending' to re-enable",
    )


class CalendarEventResponse(BaseModel):
    """A scheduled calendar event, enriched with its content details for display."""

    id: int
    content_id: int
    scheduled_date: datetime
    status: str
    platforms: list[str] = Field(default_factory=list)
    draft_mode: bool = False
    override_title: Optional[str] = None
    override_body: Optional[str] = None
    linkedin_account_labels: Optional[list[str]] = None
    notes: Optional[str] = None
    published_at: Optional[datetime] = None
    error_message: Optional[str] = None
    results: Optional[list[dict]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Denormalized content fields for convenient calendar rendering
    content_platform: Optional[str] = None
    content_title: Optional[str] = None
    content_body: Optional[str] = None
    media_path: Optional[str] = None
    media_type: Optional[str] = None
    media_url: Optional[str] = None
    needs_media: bool = False
    asset_type: Optional[str] = None

    class Config:
        from_attributes = True


class CustomHolidayCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    date: Date
    note: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def strip_fields(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("name is required")
        if self.note is not None:
            cleaned = self.note.strip()
            self.note = cleaned or None
        return self


class CustomHolidayUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    date: Optional[Date] = None
    note: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def strip_fields(self):
        if self.name is not None:
            self.name = self.name.strip()
            if not self.name:
                raise ValueError("name cannot be empty")
        if self.note is not None:
            cleaned = self.note.strip()
            self.note = cleaned or None
        return self


class CustomHolidayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    date: Date
    note: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
