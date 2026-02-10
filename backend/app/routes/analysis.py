"""Analysis API routes for email classification results."""
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_admin
from app.database import get_db
from app.services.analysis_pipeline import (
    get_account_analyses,
    get_analysis_stats,
    get_review_queue,
    analyze_email,
)

router = APIRouter()


@router.get("/stats")
async def analysis_stats(_=Depends(require_admin)):
    """Get global email analysis statistics."""
    stats = await get_analysis_stats()
    return stats


@router.get("/review-queue")
async def review_queue(_=Depends(require_admin)):
    """Get emails needing manual review."""
    items = await get_review_queue()
    return {"items": items, "total": len(items)}


@router.get("/account/{account_id}")
async def account_analyses(
    account_id: str,
    category: str | None = Query(None),
    _=Depends(require_admin),
):
    """Get all analyses for an account, optionally filtered by category."""
    db = get_db()
    filters: dict[str, str] = {"account_id": f"eq.{account_id}"}
    if category:
        filters["category"] = f"eq.{category}"
    analyses = await db.select(
        "email_analyses",
        filters=filters,
        order="created_at.desc",
    )
    return {"analyses": analyses}


@router.patch("/review/{analysis_id}")
async def update_analysis(
    analysis_id: int,
    body: dict,
    _=Depends(require_admin),
):
    """Manually update an analysis classification (for review queue)."""
    db = get_db()
    data = {}
    if "category" in body:
        data["category"] = body["category"]
    if "sub_category" in body:
        data["sub_category"] = body["sub_category"]
    if "urgency" in body:
        data["urgency"] = body["urgency"]
    if "action_required" in body:
        data["action_required"] = body["action_required"]
    if data:
        data["analysis_source"] = "manual"
        data["confidence"] = 1.0
    result = await db.update("email_analyses", data, filters={"id": f"eq.{analysis_id}"})
    if not result:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return result[0]
