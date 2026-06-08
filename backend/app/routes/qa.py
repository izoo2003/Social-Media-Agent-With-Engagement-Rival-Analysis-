"""
API Routes - QA/Compliance Checking
POST /qa/check - Check content for compliance
GET /qa/reports/{id} - Fetch QA report
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_db

router = APIRouter()


@router.post("/qa/check")
async def check_content_compliance(
    content_id: int,
    db: Session = Depends(get_db),
):
    """
    Run QA/compliance check on content.
    Orchestrates the QA Agent to validate against brand guidelines.
    """
    # TODO: Run QA check via agent
    return {
        "content_id": content_id,
        "status": "pending",
        "score": 0.0,
        "issues": [],
    }


@router.get("/qa/reports/{report_id}")
async def get_qa_report(
    report_id: int,
    db: Session = Depends(get_db),
):
    """
    Fetch detailed QA report.
    """
    # TODO: Query QA report
    return {}
