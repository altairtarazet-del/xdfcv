from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth import require_admin, require_role
from app.database import get_db

router = APIRouter()

STAGES = [
    "REGISTERED", "IDENTITY_VERIFIED", "BGC_PENDING",
    "BGC_CLEAR", "BGC_CONSIDER", "ACTIVE", "DEACTIVATED",
]


@router.get("/stats")
async def dashboard_stats(_=Depends(require_admin)):
    db = get_db()
    # Get all accounts to count stages
    accounts = await db.select("accounts", columns="stage")
    counts = {s: 0 for s in STAGES}
    for a in accounts:
        stage = a.get("stage")
        if stage in counts:
            counts[stage] += 1

    # Last scan
    scans = await db.select("scan_logs", order="started_at.desc", limit=1)
    last_scan = scans[0] if scans else None

    # Unread alerts count
    unread_alerts = await db.count("alerts", filters={"is_read": "eq.false"})

    return {
        "stage_counts": counts,
        "total_accounts": sum(counts.values()),
        "last_scan": last_scan,
        "unread_alerts": unread_alerts,
    }


@router.get("/accounts")
async def dashboard_accounts(
    stage: str | None = Query(None),
    search: str | None = Query(None),
    status: str | None = Query(None),
    assigned_admin_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _=Depends(require_admin),
):
    db = get_db()
    filters: dict[str, str] = {}
    if stage:
        filters["stage"] = f"eq.{stage}"
    if search:
        filters["or"] = f"(email.ilike.*{search}*,customer_name.ilike.*{search}*,first_name.ilike.*{search}*,last_name.ilike.*{search}*)"
    if status:
        filters["status"] = f"eq.{status}"
    if assigned_admin_id:
        filters["assigned_admin_id"] = f"eq.{assigned_admin_id}"

    offset = (page - 1) * per_page
    total = await db.count("accounts", filters=filters if filters else None)
    accounts = await db.select(
        "accounts",
        columns="id,email,stage,stage_updated_at,last_scanned_at,scan_error,notes,created_at,customer_name,first_name,middle_name,last_name,date_of_birth,phone,tags,status,assigned_admin_id",
        filters=filters if filters else None,
        order="updated_at.desc",
        limit=per_page,
        offset=offset,
    )

    return {
        "accounts": accounts,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/accounts/{email}")
async def account_detail(email: str, _=Depends(require_admin)):
    db = get_db()
    accounts = await db.select("accounts", filters={"email": f"eq.{email}"})
    if not accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    account = accounts[0]
    history = await db.select(
        "stage_history",
        filters={"account_id": f"eq.{account['id']}"},
        order="changed_at.desc",
    )
    return {"account": account, "history": history}


class AccountUpdateRequest(BaseModel):
    customer_name: str | None = None
    phone: str | None = None
    tags: list[str] | None = None
    status: str | None = None
    assigned_admin_id: str | None = None
    notes: str | None = None


@router.patch("/accounts/{email}")
async def update_account(email: str, body: AccountUpdateRequest, _=Depends(require_role("admin"))):
    db = get_db()
    data = {}
    if body.customer_name is not None:
        data["customer_name"] = body.customer_name
    if body.phone is not None:
        data["phone"] = body.phone
    if body.tags is not None:
        import json
        data["tags"] = json.dumps(body.tags)
    if body.status is not None:
        if body.status not in ("active", "suspended", "archived"):
            raise HTTPException(status_code=400, detail="Invalid status")
        data["status"] = body.status
    if body.assigned_admin_id is not None:
        data["assigned_admin_id"] = body.assigned_admin_id if body.assigned_admin_id else None
    if body.notes is not None:
        data["notes"] = body.notes
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.update("accounts", data, filters={"email": f"eq.{email}"})
    if not result:
        raise HTTPException(status_code=404, detail="Account not found")
    return result[0]


# --- Bulk Actions ---

class BulkActionRequest(BaseModel):
    account_ids: list[str]
    action: str  # "archive", "suspend", "activate", "assign_admin"
    value: str | None = None  # admin_id for assign


@router.post("/bulk-action")
async def bulk_action(body: BulkActionRequest, _=Depends(require_role("admin"))):
    db = get_db()
    updated = 0
    for account_id in body.account_ids:
        data = {}
        if body.action == "archive":
            data["status"] = "archived"
        elif body.action == "suspend":
            data["status"] = "suspended"
        elif body.action == "activate":
            data["status"] = "active"
        elif body.action == "assign_admin":
            data["assigned_admin_id"] = body.value
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")
        result = await db.update("accounts", data, filters={"id": f"eq.{account_id}"})
        if result:
            updated += 1
    return {"updated": updated}


# --- Alerts ---

@router.get("/alerts")
async def list_alerts(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    _=Depends(require_admin),
):
    db = get_db()
    filters: dict[str, str] = {}
    if unread_only:
        filters["is_read"] = "eq.false"
    offset = (page - 1) * per_page
    total = await db.count("alerts", filters=filters if filters else None)
    alerts = await db.select(
        "alerts",
        filters=filters if filters else None,
        order="created_at.desc",
        limit=per_page,
        offset=offset,
    )
    return {"alerts": alerts, "total": total}


@router.patch("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: int, payload: dict = Depends(require_admin)):
    from datetime import datetime, timezone
    db = get_db()
    result = await db.update("alerts", {
        "is_read": True,
        "read_by": payload.get("admin_id"),
        "read_at": datetime.now(timezone.utc).isoformat(),
    }, filters={"id": f"eq.{alert_id}"})
    if not result:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True}


@router.post("/alerts/mark-all-read")
async def mark_all_alerts_read(payload: dict = Depends(require_admin)):
    from datetime import datetime, timezone
    db = get_db()
    await db.update("alerts", {
        "is_read": True,
        "read_by": payload.get("admin_id"),
        "read_at": datetime.now(timezone.utc).isoformat(),
    }, filters={"is_read": "eq.false"})
    return {"ok": True}
