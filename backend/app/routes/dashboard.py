from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_admin
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

    return {
        "stage_counts": counts,
        "total_accounts": sum(counts.values()),
        "last_scan": last_scan,
    }


@router.get("/accounts")
async def dashboard_accounts(
    stage: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _=Depends(require_admin),
):
    db = get_db()
    filters: dict[str, str] = {}
    if stage:
        filters["stage"] = f"eq.{stage}"
    if search:
        filters["email"] = f"ilike.*{search}*"

    offset = (page - 1) * per_page
    total = await db.count("accounts", filters=filters if filters else None)
    accounts = await db.select(
        "accounts",
        columns="id,email,stage,stage_updated_at,last_scanned_at,scan_error,notes,created_at",
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
