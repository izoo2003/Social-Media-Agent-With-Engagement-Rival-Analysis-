"""
Pydantic Schemas - Campaign planning DTOs
"""

from datetime import date, datetime
from enum import Enum as PyEnum
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.content import ContentPlatform


class CampaignAssetType(str, PyEnum):
    REEL = "reel"
    POST_IMAGE = "post_image"
    STORY = "story"
    GRAPHIC = "graphic"
    ANIMATION = "animation"
    VIDEO = "video"


class CampaignProductInput(BaseModel):
    """One product/category row. Category is required; product is optional."""

    category: str = Field(..., min_length=1, description="Product category")
    product: Optional[str] = Field(
        default=None, description="Specific product name (optional)"
    )

    @field_validator("category")
    @classmethod
    def strip_category(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if not cleaned:
            raise ValueError("category is required")
        return cleaned

    @field_validator("product")
    @classmethod
    def strip_product(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned or None


class CampaignPlanRequest(BaseModel):
    """Generate a multi-day campaign plan via AI."""

    name: Optional[str] = Field(default=None, max_length=255)
    start_date: date = Field(..., description="Campaign start date (local PKT calendar day)")
    duration_days: int = Field(default=14, ge=1, le=90)
    platforms: list[ContentPlatform] = Field(
        default_factory=lambda: [ContentPlatform.INSTAGRAM, ContentPlatform.FACEBOOK]
    )
    products: list[CampaignProductInput] = Field(
        ..., min_length=1, description="One or more category (+ optional product) rows"
    )


class CampaignItemResponse(BaseModel):
    id: int
    campaign_id: int
    day_index: int
    scheduled_at_utc: datetime
    scheduled_at_pkt: Optional[str] = None
    platforms: list[str] = Field(default_factory=list)
    asset_type: str
    topic: Optional[str] = None
    title: str
    body: str
    product: Optional[str] = None
    category: Optional[str] = None
    content_id: Optional[int] = None
    calendar_event_id: Optional[int] = None
    sort_order: int = 0

    class Config:
        from_attributes = True


class CampaignResponse(BaseModel):
    id: int
    name: str
    start_date: date
    duration_days: int
    platforms: list[str] = Field(default_factory=list)
    products: list[dict] = Field(default_factory=list)
    status: str
    plan_summary: Optional[dict] = None
    timezone: str = "Asia/Karachi"
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: list[CampaignItemResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class CampaignListItem(BaseModel):
    """Lightweight list row without full timeline items."""

    id: int
    name: str
    start_date: date
    duration_days: int
    platforms: list[str] = Field(default_factory=list)
    products: list[dict] = Field(default_factory=list)
    status: str
    plan_summary: Optional[dict] = None
    timezone: str = "Asia/Karachi"
    item_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CampaignCommitResponse(BaseModel):
    campaign: CampaignResponse
    content_ids: list[int] = Field(default_factory=list)
    calendar_event_ids: list[int] = Field(default_factory=list)
    message: str = "Campaign committed to calendar"
