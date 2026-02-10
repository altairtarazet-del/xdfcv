from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_admin
from app.database import get_pool

router = APIRouter()

STAGES = [
    "REGISTERED", "IDENTITY_VERIFIED", "BGC_PENDING",
    "BGC_CLEAR", "BGC_CONSIDER", "ACTIVE", "DEACTIVATED",
]


@router.get("/stats")
async def dashboard_stats(_=Depends(require_admin)):
    pool = get_pool()
    # Stage counts
    rows = await pool.fetch(
        "SELECT stage, COUNT(*) as count FROM accounts GROUP BY stage"
    )
    counts = {s: 0 for s in STAGES}
    for r in rows:
        counts[r["stage"]] = r["count"]
    # Last scan
    last_scan = await pool.fetchrow(
        "SELECT * FROM scan_logs ORDER BY started_at DESC LIMIT 1"
    )
    return {
        "stage_counts": counts,
        "total_accounts": sum(counts.values()),
        "last_scan": dict(last_scan) if last_scan else None,
    }


@router.get("/accounts")
async def dashboard_accounts(
    stage: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _=Depends(require_admin),
):
    pool = get_pool()
    conditions = []
    params = []
    idx = 1

    if stage:
        conditions.append(f"stage = ${idx}")
        params.append(stage)
        idx += 1
    if search:
        conditions.append(f"email ILIKE ${idx}")
        params.append(f"%{search}%")
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    offset = (page - 1) * per_page

    total = await pool.fetchval(f"SELECT COUNT(*) FROM accounts {where}", *params)
    rows = await pool.fetch(
        f"SELECT id, email, stage, stage_updated_at, last_scanned_at, scan_error, notes, created_at "
        f"FROM accounts {where} ORDER BY updated_at DESC "
        f"LIMIT ${idx} OFFSET ${idx + 1}",
        *params, per_page, offset,
    )
    return {
        "accounts": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/accounts/{email}")
async def account_detail(email: str, _=Depends(require_admin)):
    pool = get_pool()
    account = await pool.fetchrow("SELECT * FROM accounts WHERE email = $1", email)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    history = await pool.fetch(
        "SELECT * FROM stage_history WHERE account_id = $1 ORDER BY changed_at DESC",
        account["id"],
    )
    return {"account": dict(account), "history": [dict(h) for h in history]}
