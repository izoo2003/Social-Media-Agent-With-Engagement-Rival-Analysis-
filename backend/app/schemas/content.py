"""
Pydantic Schemas - Content Generation DTOs
"""

from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional

from pydantic import BaseModel, Field


class ContentPlatform(str, PyEnum):
    """Supported platforms."""

    LINKEDIN = "linkedin"
    TIKTOK = "tiktok"
    FACEBOOK = "facebook"
    YOUTUBE = "youtube"
    WHATSAPP = "whatsapp"
    EMAIL = "email"
    INSTAGRAM = "instagram"
    TWITTER = "twitter"


class MediaType(str, PyEnum):
    """Supported media types."""

    IMAGE = "image"
    VIDEO = "video"
    DOCUMENT = "document"


class ContentMetadata(BaseModel):
    """Content metadata."""

    hashtags: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    tone: str = "professional"
    target_audience: str = ""
    call_to_action: str = ""


class ContentGenerationRequest(BaseModel):
    """Request model for content generation."""

    platforms: list[ContentPlatform] = Field(
        ..., description="Platforms to generate content for"
    )
    topic: str = Field(..., description="Main topic/subject of content")
    brand_context: str = Field(
        default="Kafi Commodities", description="Brand context for content generation"
    )
    tone: str = Field(default="professional", description="Tone of content")
    target_audience: str = Field(
        default="business", description="Target audience (business/consumer)"
    )
    call_to_action: str = Field(default="", description="Call to action to include")
    additional_instructions: str = Field(default="", description="Additional specific instructions")
    # Optional media already stored (e.g. after browser→Supabase direct upload)
    media_path: Optional[str] = Field(
        default=None,
        description="Storage path from a prior upload (e.g. videos/20240101_abc.mp4)",
    )
    media_type: Optional[str] = Field(default=None, description="image | video | document")
    media_original_name: Optional[str] = Field(
        default=None, description="Original filename of the attached media"
    )


class ContentRegenerateRequest(BaseModel):
    """Request to regenerate caption title/body for existing content."""

    topic: str = Field(..., description="Original topic used for generation")
    brand_context: str = Field(default="Kafi Commodities")
    tone: str = Field(default="professional")
    target_audience: str = Field(default="business")
    call_to_action: str = Field(default="")
    additional_instructions: str = Field(default="")
    regeneration_instructions: str = Field(
        default="",
        description="User feedback on what to change in the new caption",
    )


class ContentGenerationResponse(BaseModel):
    """Response model for generated content."""

    content_id: int
    platform: ContentPlatform
    title: str
    body: str
    metadata: ContentMetadata
    status: str
    generated_at: datetime
    media_path: Optional[str] = None
    media_type: Optional[str] = None
    media_original_name: Optional[str] = None


class ContentHistoryResponse(BaseModel):
    """Response model for content history."""

    id: int
    platform: ContentPlatform
    title: str
    body: str
    status: str
    created_at: datetime
    updated_at: datetime
    media_path: Optional[str] = None
    media_type: Optional[str] = None
    linkedin_post_status: str = "pending"
    facebook_post_status: str = "pending"
    instagram_post_status: str = "pending"
    youtube_post_status: str = "pending"
    tiktok_post_status: str = "pending"
    linkedin_post_id: Optional[str] = None
    facebook_post_id: Optional[str] = None
    instagram_post_id: Optional[str] = None
    youtube_post_id: Optional[str] = None
    tiktok_post_id: Optional[str] = None
    linkedin_accounts_results: Optional[list[dict]] = None

    class Config:
        from_attributes = True


class ContentDetailResponse(BaseModel):
    """Detailed content response."""

    id: int
    platform: ContentPlatform
    title: str
    body: str
    metadata: dict
    status: str
    generated_at: datetime
    created_at: datetime
    updated_at: datetime
    media_path: Optional[str] = None
    media_type: Optional[str] = None
    media_original_name: Optional[str] = None
    linkedin_post_status: str = "pending"
    facebook_post_status: str = "pending"
    instagram_post_status: str = "pending"
    youtube_post_status: str = "pending"
    tiktok_post_status: str = "pending"
    linkedin_post_id: Optional[str] = None
    facebook_post_id: Optional[str] = None
    instagram_post_id: Optional[str] = None
    youtube_post_id: Optional[str] = None
    tiktok_post_id: Optional[str] = None
    linkedin_accounts_results: Optional[list[dict]] = None

    class Config:
        from_attributes = True


class MediaUploadResponse(BaseModel):
    """Response after media file upload."""

    media_path: str
    media_type: str
    media_original_name: str
    media_url: str


class ManualContentCreate(BaseModel):
    """Create a ready-to-schedule content record without AI generation."""

    platform: ContentPlatform = Field(
        ..., description="Primary platform for the content record"
    )
    title: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    media_path: Optional[str] = Field(
        default=None, description="Storage path from /content/media/upload"
    )
    media_type: Optional[str] = Field(default=None, description="image | video | document")
    media_original_name: Optional[str] = None


class MediaProcessConfigResponse(BaseModel):
    """Which processor the frontend should use for large videos."""

    provider: str  # cloudconvert | browser
    cloudconvert_enabled: bool


class MediaProcessStartRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(default="video/mp4")
    size_bytes: int = Field(default=0, ge=0)


class MediaProcessStartResponse(BaseModel):
    job_id: str
    upload_url: str
    upload_parameters: dict


class MediaProcessCompleteRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    original_filename: str = Field(default="video.mp4")


class SocialPostRequest(BaseModel):
    """Request to post content to social media."""

    content_id: int = Field(..., description="ID of the content to post")
    platforms: list[ContentPlatform] = Field(
        ..., description="Platforms to post to (linkedin, facebook, instagram, youtube)"
    )
    draft_mode: bool = Field(
        default=False,
        description="If True, saves as draft instead of publishing live",
    )
    override_title: Optional[str] = Field(
        default=None,
        description="Override the stored caption title with an edited version",
    )
    override_body: Optional[str] = Field(
        default=None,
        description="Override the stored caption body with an edited version",
    )
    linkedin_account_labels: Optional[list[str]] = Field(
        default=None,
        description="Post to specific LinkedIn accounts by label. Omit to post to all configured accounts.",
    )
    designer_pin: Optional[str] = Field(
        default=None,
        description="Designer PIN. Required to post directly when approval is enabled.",
    )


class SocialPostResponse(BaseModel):
    """Response after posting to social media."""

    content_id: int
    platform: ContentPlatform
    status: str  # published, failed, draft, partial
    post_url: Optional[str] = None
    post_id: Optional[str] = None
    error_message: Optional[str] = None
    account_label: Optional[str] = None
