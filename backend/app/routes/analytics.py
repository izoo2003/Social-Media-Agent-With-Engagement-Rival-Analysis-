"""
API Routes - Analytics & Metrics
GET /analytics/overview - Overall dashboard metrics
GET /analytics/summary - Account-level analytics for all platforms
GET /analytics/{platform} - Account-level analytics for one platform
GET /analytics/trends - Trending topics and keywords
GET /analytics/metrics - Detailed metrics breakdown
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.services.social_analytics import SocialAnalyticsService

router = APIRouter()


def _range_to_days(range_value: str) -> int:
    """Parse dashboard range values like 7d, 30d, and 90d."""
    allowed = {"7d": 7, "30d": 30, "90d": 90}
    return allowed.get(range_value, 30)


@router.get("/analytics/summary")
async def get_analytics_summary(
    range_value: str = Query("30d", alias="range", pattern="^(7d|30d|90d)$"),
    db: Session = Depends(get_db),
):
    """
    Fetch account-level analytics for all configured social platforms.
    """
    _ = db  # Reserved for future analytics snapshot caching.
    service = SocialAnalyticsService()
    return service.get_summary(days=_range_to_days(range_value))


@router.get("/analytics/overview")
async def get_analytics_overview(
    db: Session = Depends(get_db),
):
    """
    Fetch overall analytics dashboard summary.
    """
    _ = db
    service = SocialAnalyticsService()
    return service.get_summary(days=30)


@router.get("/analytics/trends")
async def get_trending_content(
    days: int = 7,
    db: Session = Depends(get_db),
):
    """
    Fetch trending topics and keywords from scraped data.
    """
    # TODO: Get trends from scraped data
    return {
        "trending_hashtags": [],
        "trending_keywords": [],
        "trending_topics": [],
    }


@router.get("/analytics/metrics")
async def get_detailed_metrics(
    metric_type: str = "all",
    range_value: str = Query("30d", alias="range", pattern="^(7d|30d|90d)$"),
    db: Session = Depends(get_db),
):
    """
    Get detailed metrics breakdown.
    """
    _ = db
    service = SocialAnalyticsService()
    if metric_type == "all":
        return service.get_summary(days=_range_to_days(range_value))
    return service.get_platform(platform=metric_type, days=_range_to_days(range_value))


@router.get("/analytics/{platform}")
async def get_platform_analytics(
    platform: str,
    range_value: str = Query("30d", alias="range", pattern="^(7d|30d|90d)$"),
    db: Session = Depends(get_db),
):
    """
    Fetch account-level analytics for a single platform.
    """
    _ = db  # Reserved for future analytics snapshot caching.
    service = SocialAnalyticsService()
    return service.get_platform(platform=platform, days=_range_to_days(range_value))
