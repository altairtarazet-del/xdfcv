"""Analysis API routes for email classification results."""
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_admin
from app.database import get_db, sanitize_filter_value
from app.services.analysis_pipeline import (
    get_account_analyses,
    get_analysis_stats,
    get_review_queue,
    analyze_email,
)

router = APIRouter()


def _build_analysis_filters(
    *,
    account_id: str | None = None,
    category: str | None = None,
    urgency: str | None = None,
    source: str | None = None,
    action_required: bool | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, str]:
    """Build PostgREST filter dict for email_analyses queries."""
    filters: dict[str, str] = {}
    if account_id:
        filters["account_id"] = f"eq.{account_id}"
    if category:
        filters["category"] = f"eq.{category}"
    if urgency:
        filters["urgency"] = f"eq.{urgency}"
    if source:
        filters["analysis_source"] = f"eq.{source}"
    if action_required is not None:
        filters["action_required"] = f"is.{str(action_required).lower()}"
    if search:
        safe = sanitize_filter_value(search)
        filters["summary"] = f"ilike.*{safe}*"
    # Date range: PostgREST can't have duplicate keys, so use `and` when both present
    if date_from and date_to:
        filters["and"] = f"(created_at.gte.{date_from},created_at.lte.{date_to})"
    elif date_from:
        filters["created_at"] = f"gte.{date_from}"
    elif date_to:
        filters["created_at"] = f"lte.{date_to}"
    return filters


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


@router.get("/search")
async def search_analyses(
    category: str | None = Query(None),
    urgency: str | None = Query(None),
    source: str | None = Query(None),
    action_required: bool | None = Query(None),
    search: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _=Depends(require_admin),
):
    """Global analysis search across all accounts."""
    db = get_db()
    filters = _build_analysis_filters(
        category=category,
        urgency=urgency,
        source=source,
        action_required=action_required,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    offset = (page - 1) * per_page
    total = await db.count("email_analyses", filters=filters if filters else None)
    analyses = await db.select(
        "email_analyses",
        filters=filters if filters else None,
        order="created_at.desc",
        limit=per_page,
        offset=offset,
    )

    # Enrich with account emails
    account_ids = list({a["account_id"] for a in analyses if a.get("account_id")})
    email_map: dict[str, str] = {}
    if account_ids:
        accounts = await db.select(
            "accounts",
            columns="id,email",
            filters={"or": "(" + ",".join(f"id.eq.{aid}" for aid in account_ids) + ")"},
        )
        email_map = {acc["id"]: acc["email"] for acc in accounts}

    for a in analyses:
        a["account_email"] = email_map.get(a.get("account_id", ""), "")

    return {
        "analyses": analyses,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/account/{account_id}")
async def account_analyses(
    account_id: str,
    category: str | None = Query(None),
    urgency: str | None = Query(None),
    source: str | None = Query(None),
    action_required: bool | None = Query(None),
    search: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _=Depends(require_admin),
):
    """Get analyses for an account with filtering and pagination."""
    db = get_db()
    filters = _build_analysis_filters(
        account_id=account_id,
        category=category,
        urgency=urgency,
        source=source,
        action_required=action_required,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    offset = (page - 1) * per_page
    total = await db.count("email_analyses", filters=filters)
    analyses = await db.select(
        "email_analyses",
        filters=filters,
        order="created_at.desc",
        limit=per_page,
        offset=offset,
    )
    return {
        "analyses": analyses,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


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
