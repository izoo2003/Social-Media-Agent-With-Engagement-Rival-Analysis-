"""
API Routes - Designer KPIs (Creation + Guidelines)

GET    /kpis/catalog
GET    /kpis/summary?from=&to=
POST   /kpis/manual
PATCH  /kpis/manual/{id}
DELETE /kpis/manual/{id}
POST   /kpis/custom
PATCH  /kpis/custom/{id}
DELETE /kpis/custom/{id}
POST   /kpis/guidelines?from=&to=
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.dependencies import get_current_user_role, get_db
from app.middleware.rate_limiter import limiter
from app.schemas.kpi import (
    KpiCatalogItem,
    KpiCustomCreate,
    KpiCustomDefinitionResponse,
    KpiCustomUpdate,
    KpiGuidelinesResponse,
    KpiManualCreate,
    KpiManualEntryResponse,
    KpiManualUpdate,
    KpiSummaryResponse,
)
from app.services import auth_service
from app.services.kpi import CATALOG, KpiService, pkt_today
from app.services.kpi_guidelines import generate_guidelines
from app.utils.logger import logger

router = APIRouter()


def _require_senior(role: str) -> None:
    if role == "junior":
        raise HTTPException(
            status_code=403,
            detail="Senior access only — KPIs are for the designer.",
        )


def _optional_user(request: Request) -> str:
    if getattr(request.state, "dashboard_user", None):
        return str(request.state.dashboard_user)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = auth_service.decode_access_token(auth[7:].strip())
        if payload and payload.get("sub"):
            return str(payload["sub"])
    return "system"


@router.get("/kpis/catalog", response_model=list[KpiCatalogItem])
def get_kpi_catalog(
    role: str = Depends(get_current_user_role),
):
    """Fixed auto-catalog labels for the KPI Creation form."""
    _require_senior(role)
    return CATALOG


@router.get("/kpis/summary", response_model=KpiSummaryResponse)
def get_kpi_summary(
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """Auto + manual KPI totals and a daily breakdown in Asia/Karachi."""
    _require_senior(role)
    today = pkt_today()
    start = from_date or today
    end = to_date or start
    try:
        return KpiService(db).get_summary(start, end)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"KPI summary error: {e}")
        raise HTTPException(status_code=500, detail="Failed to load KPI summary")


@router.post("/kpis/manual", response_model=KpiManualEntryResponse)
@limiter.limit("60/minute")
def create_manual_kpi(
    request: Request,
    body: KpiManualCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    _require_senior(role)
    try:
        entry = KpiService(db).create_manual(
            metric_key=body.metric_key,
            custom_definition_id=body.custom_definition_id,
            quantity=body.quantity,
            note=body.note,
            occurred_on=body.occurred_on,
            created_by=_optional_user(request),
        )
        return KpiService(db)._entry_dict(entry)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"KPI manual create error: {e}")
        raise HTTPException(status_code=500, detail="Failed to add manual KPI")


@router.patch("/kpis/manual/{entry_id}", response_model=KpiManualEntryResponse)
def update_manual_kpi(
    entry_id: int,
    body: KpiManualUpdate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    _require_senior(role)
    patch = body.model_dump(exclude_unset=True)
    try:
        entry = KpiService(db).update_manual(entry_id, patch)
        return KpiService(db)._entry_dict(entry)
    except KeyError:
        raise HTTPException(status_code=404, detail="Manual entry not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"KPI manual update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update manual KPI")


@router.delete("/kpis/manual/{entry_id}")
def delete_manual_kpi(
    entry_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    _require_senior(role)
    try:
        KpiService(db).delete_manual(entry_id)
        return {"ok": True}
    except KeyError:
        raise HTTPException(status_code=404, detail="Manual entry not found")
    except Exception as e:
        logger.error(f"KPI manual delete error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete manual KPI")


@router.post("/kpis/custom", response_model=KpiCustomDefinitionResponse)
@limiter.limit("30/minute")
def create_custom_kpi(
    request: Request,
    body: KpiCustomCreate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    _ = request
    _require_senior(role)
    try:
        return KpiService(db).create_custom(body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"KPI custom create error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create custom KPI")


@router.patch("/kpis/custom/{definition_id}", response_model=KpiCustomDefinitionResponse)
def update_custom_kpi(
    definition_id: int,
    body: KpiCustomUpdate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    _require_senior(role)
    try:
        return KpiService(db).update_custom(
            definition_id,
            name=body.name,
            is_active=body.is_active,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Custom KPI not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"KPI custom update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update custom KPI")


@router.delete("/kpis/custom/{definition_id}", response_model=KpiCustomDefinitionResponse)
def archive_custom_kpi(
    definition_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """Archive a custom KPI card. Existing manual entries are kept."""
    _require_senior(role)
    try:
        return KpiService(db).archive_custom(definition_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Custom KPI not found")
    except Exception as e:
        logger.error(f"KPI custom archive error: {e}")
        raise HTTPException(status_code=500, detail="Failed to archive custom KPI")


@router.post("/kpis/guidelines", response_model=KpiGuidelinesResponse)
@limiter.limit("8/minute")
def create_kpi_guidelines(
    request: Request,
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user_role),
):
    """Gemini review of designer KPIs vs a 9-hour shift, plus recent published posts."""
    _ = request
    _require_senior(role)
    today = pkt_today()
    start = from_date or today
    end = to_date or start
    try:
        return generate_guidelines(db, start, end)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"KPI guidelines error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate KPI guidelines")
