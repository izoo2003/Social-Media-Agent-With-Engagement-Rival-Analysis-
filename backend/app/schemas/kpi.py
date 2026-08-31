"""
Pydantic Schemas - Designer KPI Creation DTOs
"""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class KpiCatalogItem(BaseModel):
    key: str
    label: str
    description: str


class KpiCounts(BaseModel):
    auto: int = 0
    manual: int = 0
    total: int = 0


class KpiCatalogMetric(KpiCounts):
    key: str
    label: str
    description: str = ""
    breakdown: Optional[dict[str, int]] = None


class KpiCustomMetric(KpiCounts):
    id: int
    name: str
    kind: str = "custom"
    is_active: bool = True


class KpiDailyCatalogCounts(KpiCounts):
    breakdown: Optional[dict[str, int]] = None


class KpiDailyRow(BaseModel):
    date: date
    catalog: dict[str, KpiDailyCatalogCounts] = Field(default_factory=dict)
    custom: dict[str, KpiCounts] = Field(default_factory=dict)


class KpiManualEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    metric_key: Optional[str] = None
    custom_definition_id: Optional[int] = None
    custom_name: Optional[str] = None
    custom_kind: Optional[str] = None
    quantity: int
    note: Optional[str] = None
    occurred_on: date
    created_by: Optional[str] = None
    created_at: datetime


class KpiCustomDefinitionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: str = "custom"
    is_active: bool
    created_at: datetime


class KpiSummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")
    timezone: str = "Asia/Karachi"
    catalog: list[KpiCatalogMetric]
    custom: list[KpiCustomMetric]
    daily: list[KpiDailyRow]
    manual_entries: list[KpiManualEntryResponse]


class KpiManualCreate(BaseModel):
    metric_key: Optional[str] = Field(
        default=None,
        description="Catalog metric key, e.g. images_generated",
    )
    custom_definition_id: Optional[int] = Field(
        default=None,
        description="Custom KPI card id (mutually exclusive with metric_key)",
    )
    quantity: int = Field(..., ge=1, le=100_000)
    note: Optional[str] = Field(default=None, max_length=500)
    occurred_on: date

    @model_validator(mode="after")
    def exactly_one_target(self):
        has_key = bool((self.metric_key or "").strip())
        has_custom = self.custom_definition_id is not None
        if has_key == has_custom:
            raise ValueError("Provide either metric_key or custom_definition_id, not both.")
        if self.metric_key:
            self.metric_key = self.metric_key.strip()
        if self.note is not None:
            cleaned = self.note.strip()
            self.note = cleaned or None
        return self


class KpiManualUpdate(BaseModel):
    quantity: Optional[int] = Field(default=None, ge=1, le=100_000)
    note: Optional[str] = Field(default=None, max_length=500)
    occurred_on: Optional[date] = None
    metric_key: Optional[str] = None
    custom_definition_id: Optional[int] = None

    @model_validator(mode="after")
    def strip_note(self):
        if self.note is not None:
            cleaned = self.note.strip()
            self.note = cleaned or None
        if self.metric_key is not None:
            self.metric_key = self.metric_key.strip() or None
        return self


class KpiCustomCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    kind: str = Field(default="custom", description="custom | website_maintenance")

    @model_validator(mode="after")
    def strip_name(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("name is required")
        cleaned = (self.kind or "custom").strip().lower()
        if cleaned not in {"custom", "website_maintenance"}:
            raise ValueError("kind must be custom or website_maintenance")
        self.kind = cleaned
        return self


class KpiGuidelinesImprovement(BaseModel):
    area: str
    finding: str
    action: str
    priority: str = "medium"


class KpiGuidelinesPostNote(BaseModel):
    content_id: Optional[int] = None
    title: str = ""
    comment: str


class KpiReviewedPost(BaseModel):
    id: int
    title: str
    body_preview: str = ""
    platform: Optional[str] = None
    media_type: Optional[str] = None
    occurred_on: Optional[str] = None
    image_reviewed: bool = False


class KpiGuidelinesResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")
    timezone: str = "Asia/Karachi"
    shift_hours: int = 9
    shift_days: int = 1
    verdict: str
    verdict_label: str
    summary: str
    more_needed: list[str] = Field(default_factory=list)
    improvements: list[KpiGuidelinesImprovement] = Field(default_factory=list)
    post_notes: list[KpiGuidelinesPostNote] = Field(default_factory=list)
    reviewed_posts: list[KpiReviewedPost] = Field(default_factory=list)
    images_reviewed: int = 0
    generated_at: datetime
    model: Optional[str] = None
    message: Optional[str] = None


class KpiReportMetric(BaseModel):
    key: str
    label: str
    description: str = ""
    auto: int = 0
    manual: int = 0
    total: int = 0
    breakdown: Optional[dict[str, int]] = None
    days_with_activity: int = 0
    days_in_range: int = 0
    daily_average: float = 0
    peak_day: Optional[str] = None
    peak_total: int = 0


class KpiReportResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")
    timezone: str = "Asia/Karachi"
    period_label: str
    overview: str
    highlights: list[str] = Field(default_factory=list)
    metrics: list[KpiReportMetric] = Field(default_factory=list)
    custom: list[KpiReportMetric] = Field(default_factory=list)
    generated_at: datetime
    model: Optional[str] = None
    source: str = "computed"
    message: Optional[str] = None


class KpiCustomUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def strip_name(self):
        if self.name is not None:
            self.name = self.name.strip()
            if not self.name:
                raise ValueError("name cannot be empty")
        return self
