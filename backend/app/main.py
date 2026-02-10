from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db, close_db, get_db
from app.auth import hash_password
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Seed admin user if not exists
    db = get_db()
    existing = await db.select("admin_users", filters={"username": f"eq.{settings.admin_seed_username}"})
    if not existing:
        await db.insert("admin_users", {
            "username": settings.admin_seed_username,
            "password_hash": hash_password(settings.admin_seed_password),
            "role": "super_admin",
            "display_name": "Admin",
        })
    # Start auto-sync background task
    import asyncio
    from app.services.scanner import auto_sync_accounts
    sync_task = asyncio.create_task(auto_sync_accounts())
    yield
    sync_task.cancel()
    await close_db()


app = FastAPI(title="DasherHelp API", lifespan=lifespan)

# Request ID middleware (must be added before other middleware)
from app.exceptions import RequestIdMiddleware, setup_exception_handlers  # noqa: E402

app.add_middleware(RequestIdMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://dasherhelp.com",
        "https://www.dasherhelp.com",
        "https://admin.dasherhelp.com",
        "https://portal.dasherhelp.com",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add audit and rate limit middleware
from app.middleware import AuditLogMiddleware, RateLimitMiddleware  # noqa: E402

app.add_middleware(AuditLogMiddleware)
app.add_middleware(RateLimitMiddleware)

# Setup global exception handlers
setup_exception_handlers(app)

# Register routes
from app.routes import admin_auth, dashboard, scanner, portal_auth, portal_mail, portal_users, analysis, sse, admin_mail, provisioning, analytics  # noqa: E402

app.include_router(admin_auth.router, prefix="/api/admin", tags=["admin-auth"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(scanner.router, prefix="/api", tags=["scanner"])
app.include_router(portal_auth.router, prefix="/api/portal", tags=["portal-auth"])
app.include_router(portal_mail.router, prefix="/api/portal", tags=["portal-mail"])
app.include_router(portal_users.router, prefix="/api/portal-users", tags=["portal-users"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(sse.router, prefix="/api/sse", tags=["sse"])
app.include_router(admin_mail.router, prefix="/api/admin", tags=["admin-mail"])
app.include_router(provisioning.router, prefix="/api", tags=["provisioning"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
