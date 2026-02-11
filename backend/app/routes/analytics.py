"""Analytics dashboard routes."""
from fastapi import APIRouter, Depends, Query

from app.auth import require_admin
from app.database import get_db

router = APIRouter()


@router.get("/overview")
async def analytics_overview(_=Depends(require_admin)):
    """Get overview analytics."""
    db = get_db()

    # Stage distribution
    accounts = await db.select("accounts", columns="stage,status,created_at")
    stage_counts: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    for a in accounts:
        s = a.get("stage", "REGISTERED")
        stage_counts[s] = stage_counts.get(s, 0) + 1
        st = a.get("status", "active")
        status_counts[st] = status_counts.get(st, 0) + 1

    # Email analysis stats
    analyses = await db.select("email_analyses", columns="category,analysis_source,urgency", limit=10000)
    category_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}
    for a in analyses:
        cat = a.get("category", "unknown")
        category_counts[cat] = category_counts.get(cat, 0) + 1
        src = a.get("analysis_source", "rules")
        source_counts[src] = source_counts.get(src, 0) + 1

    # Scan success rate
    scans = await db.select("scan_logs", columns="status,scanned,errors", order="started_at.desc", limit=10)
    total_scanned = sum(s.get("scanned", 0) for s in scans)
    total_errors = sum(s.get("errors", 0) for s in scans)
    scan_success_rate = (total_scanned / (total_scanned + total_errors) * 100) if (total_scanned + total_errors) > 0 else 100

    # Alert counts
    alerts = await db.select("alerts", columns="alert_type,severity,is_read")
    alert_type_counts: dict[str, int] = {}
    unread_count = 0
    for a in alerts:
        t = a.get("alert_type", "system")
        alert_type_counts[t] = alert_type_counts.get(t, 0) + 1
        if not a.get("is_read"):
            unread_count += 1

    # Recent activity (portal logins)
    portal_users = await db.select("portal_users", columns="last_login_at", order="last_login_at.desc", limit=50)
    active_last_24h = 0
    active_last_7d = 0
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    for pu in portal_users:
        if pu.get("last_login_at"):
            try:
                login_time = datetime.fromisoformat(pu["last_login_at"]).replace(tzinfo=timezone.utc)
                if now - login_time < timedelta(hours=24):
                    active_last_24h += 1
                if now - login_time < timedelta(days=7):
                    active_last_7d += 1
            except (ValueError, TypeError):
                pass

    return {
        "accounts": {
            "total": len(accounts),
            "by_stage": stage_counts,
            "by_status": status_counts,
        },
        "analysis": {
            "total": len(analyses),
            "by_category": category_counts,
            "by_source": source_counts,
        },
        "scans": {
            "recent_count": len(scans),
            "success_rate": round(scan_success_rate, 1),
            "total_scanned": total_scanned,
            "total_errors": total_errors,
        },
        "alerts": {
            "total": len(alerts),
            "unread": unread_count,
            "by_type": alert_type_counts,
        },
        "portal_activity": {
            "active_24h": active_last_24h,
            "active_7d": active_last_7d,
        },
    }


@router.get("/stage-history")
async def stage_history_timeline(
    days: int = Query(30, ge=1, le=365),
    _=Depends(require_admin),
):
    """Get stage transition history for timeline chart."""
    db = get_db()
    from datetime import datetime, timezone, timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    history = await db.select(
        "stage_history",
        columns="new_stage,changed_at",
        filters={"changed_at": f"gte.{since}"},
        order="changed_at.asc",
    )

    # Group by date
    daily: dict[str, dict[str, int]] = {}
    for h in history:
        try:
            date_str = h["changed_at"][:10]
            stage = h.get("new_stage", "REGISTERED")
            if date_str not in daily:
                daily[date_str] = {}
            daily[date_str][stage] = daily[date_str].get(stage, 0) + 1
        except (KeyError, TypeError):
            pass

    return {"timeline": daily, "days": days}
