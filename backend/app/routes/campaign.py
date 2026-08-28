"""
API Routes - Campaign planning

POST   /campaigns/plan       - Generate AI campaign plan (products/categories)
GET    /campaigns            - List campaigns
GET    /campaigns/{id}       - Campaign detail with timeline
POST   /campaigns/{id}/commit - Commit plan into Content + Calendar
DELETE /campaigns/{id}       - Delete campaign (keeps calendar if already committed)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.middleware.rate_limiter import limiter
from app.schemas.campaign import (
    CampaignCommitResponse,
    CampaignListItem,
    CampaignPlanRequest,
    CampaignResponse,
)
from app.services.campaign import CampaignService
from app.utils.logger import logger
from app.utils.sanitize import safe_error_detail

router = APIRouter()


@router.post("/campaigns/plan", response_model=CampaignResponse)
@limiter.limit("10/minute")
async def plan_campaign(
    request: Request,
    body: CampaignPlanRequest,
    db: Session = Depends(get_db),
):
    """Generate a multi-day campaign timeline via Gemini and persist it."""
    try:
        service = CampaignService(db)
        campaign = service.plan_campaign(body)
        return service.to_response_dict(campaign)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Campaign plan error: {e}")
        raise HTTPException(
            status_code=500,
            detail=safe_error_detail(e, "Failed to generate campaign plan"),
        )


@router.get("/campaigns", response_model=list[CampaignListItem])
def list_campaigns(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List recent campaigns (without full item payloads)."""
    try:
        service = CampaignService(db)
        campaigns = service.list_campaigns(skip=skip, limit=limit)
        return [
            service.to_response_dict(c, include_items=False) for c in campaigns
        ]
    except Exception as e:
        logger.error(f"Campaign list error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list campaigns: {e}")


@router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
def get_campaign(campaign_id: int, db: Session = Depends(get_db)):
    """Fetch one campaign with its full timeline."""
    service = CampaignService(db)
    campaign = service.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return service.to_response_dict(campaign)


@router.post("/campaigns/{campaign_id}/commit", response_model=CampaignCommitResponse)
@limiter.limit("20/minute")
async def commit_campaign(
    request: Request,
    campaign_id: int,
    db: Session = Depends(get_db),
):
    """Create Content + CalendarEvent rows for every campaign item."""
    try:
        service = CampaignService(db)
        campaign, content_ids, event_ids = service.commit_campaign(campaign_id)
        return {
            "campaign": service.to_response_dict(campaign),
            "content_ids": content_ids,
            "calendar_event_ids": event_ids,
            "message": (
                f"Committed {len(event_ids)} item(s) to the calendar. "
                "Attach media before each slot publishes."
            ),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Campaign commit error: {e}")
        raise HTTPException(
            status_code=500,
            detail=safe_error_detail(e, "Failed to commit campaign"),
        )


@router.delete("/campaigns/{campaign_id}")
def delete_campaign(campaign_id: int, db: Session = Depends(get_db)):
    """Delete a campaign. Committed calendar events are kept."""
    service = CampaignService(db)
    if not service.delete_campaign(campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"status": "success", "message": f"Campaign {campaign_id} deleted"}
