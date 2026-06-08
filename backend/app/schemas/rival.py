"""
Pydantic Schemas - Rival Review DTOs
"""

from typing import Optional

from pydantic import BaseModel, Field


class RivalCreate(BaseModel):
    """Request to add a new rival to track."""

    name: str = Field(..., description="Display name of the competitor")
    category: Optional[str] = Field(
        default=None, description="spice, rice, chutney, or mixed"
    )
    website: Optional[str] = None
    youtube_channel_id: Optional[str] = Field(
        default=None, description="YouTube channel ID (UC...)"
    )
    youtube_handle: Optional[str] = Field(
        default=None, description="YouTube handle, e.g. @ShanFoodsGlobal"
    )
    instagram_username: Optional[str] = Field(
        default=None, description="Instagram username (without @)"
    )
    rss_url: Optional[str] = Field(
        default=None, description="Blog/news RSS feed URL (optional)"
    )
    notes: Optional[str] = None
    is_active: bool = True


class RivalUpdate(BaseModel):
    """Update an existing rival. Only provided fields are changed."""

    name: Optional[str] = None
    category: Optional[str] = None
    website: Optional[str] = None
    youtube_channel_id: Optional[str] = None
    youtube_handle: Optional[str] = None
    instagram_username: Optional[str] = None
    rss_url: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
