"""
API Routes - Rival Review (competitor intelligence)

GET    /rivals                  - List tracked rivals (with latest analytics)
POST   /rivals                  - Add a rival
GET    /rivals/insights         - AI suggestions (rivals vs us) via Gemini
POST   /rivals/refresh-all      - Refresh analytics for all active rivals
GET    /rivals/{id}             - One rival with latest analytics
PUT    /rivals/{id}             - Update a rival
DELETE /rivals/{id}             - Remove a rival
POST   /rivals/{id}/refresh     - Refresh analytics for one rival
GET    /rivals/{id}/snapshots   - Historical snapshots (for trend charts)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.schemas.rival import RivalCreate, RivalUpdate
from app.services import rival_insights
from app.services.rival_service import RivalService, serialize_snapshot

router = APIRouter()


@router.get("/rivals")
async def list_rivals(
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    """List tracked rivals with their latest per-platform analytics.

    Seeds the curated default rivals on first use so the dashboard isn't empty.
    """
    service = RivalService(db)
    if not service.list_rivals():
        service.seed_defaults()
    rivals = service.list_rivals(active_only=active_only)
    return [service.rival_with_latest(rival) for rival in rivals]


@router.post("/rivals", status_code=201)
async def create_rival(
    payload: RivalCreate,
    db: Session = Depends(get_db),
):
    """Add a new rival to track."""
    service = RivalService(db)
    rival = service.create_rival(payload.model_dump())
    return service.rival_with_latest(rival)


@router.get("/rivals/insights")
async def get_rival_insights(
    rival_id: int | None = Query(default=None, description="Scope insights to one rival"),
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """Generate AI suggestions comparing rivals against our own performance."""
    return rival_insights.generate_insights(db, rival_id=rival_id, days=days)


@router.post("/rivals/refresh-all")
async def refresh_all_rivals(
    db: Session = Depends(get_db),
):
    """Refresh analytics snapshots for every active rival."""
    service = RivalService(db)
    results = service.refresh_all()
    return {"refreshed": len(results), "rivals": results}


@router.get("/rivals/{rival_id}")
async def get_rival(
    rival_id: int,
    db: Session = Depends(get_db),
):
    """Fetch one rival with its latest analytics."""
    service = RivalService(db)
    rival = service.get_rival(rival_id)
    if not rival:
        raise HTTPException(status_code=404, detail="Rival not found")
    return service.rival_with_latest(rival)


@router.put("/rivals/{rival_id}")
async def update_rival(
    rival_id: int,
    payload: RivalUpdate,
    db: Session = Depends(get_db),
):
    """Update a rival (only provided fields change)."""
    service = RivalService(db)
    data = payload.model_dump(exclude_unset=True)
    rival = service.update_rival(rival_id, data)
    if not rival:
        raise HTTPException(status_code=404, detail="Rival not found")
    return service.rival_with_latest(rival)


@router.delete("/rivals/{rival_id}")
async def delete_rival(
    rival_id: int,
    db: Session = Depends(get_db),
):
    """Remove a rival and its snapshots."""
    service = RivalService(db)
    if not service.delete_rival(rival_id):
        raise HTTPException(status_code=404, detail="Rival not found")
    return {"status": "deleted", "rival_id": rival_id}


@router.post("/rivals/{rival_id}/refresh")
async def refresh_rival(
    rival_id: int,
    db: Session = Depends(get_db),
):
    """Refresh analytics for a single rival (runs all collectors)."""
    service = RivalService(db)
    result = service.refresh_rival(rival_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Rival not found")
    return result


@router.get("/rivals/{rival_id}/snapshots")
async def get_rival_snapshots(
    rival_id: int,
    platform: str | None = Query(default=None),
    limit: int = Query(default=60, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """Historical snapshots for a rival (used for trend charts)."""
    service = RivalService(db)
    if not service.get_rival(rival_id):
        raise HTTPException(status_code=404, detail="Rival not found")
    snapshots = service.list_snapshots(rival_id, platform=platform, limit=limit)
    return [serialize_snapshot(snap) for snap in snapshots]
