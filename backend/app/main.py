from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db, close_db, get_pool
from app.auth import hash_password
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Run migrations
    pool = get_pool()
    async with pool.acquire() as conn:
        with open("migrations/001_initial.sql") as f:
            await conn.execute(f.read())
        # Seed admin user if not exists
        existing = await conn.fetchval(
            "SELECT id FROM admin_users WHERE username = $1", settings.admin_seed_username
        )
        if not existing:
            await conn.execute(
                "INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)",
                settings.admin_seed_username,
                hash_password(settings.admin_seed_password),
            )
    yield
    await close_db()


app = FastAPI(title="DasherHelp API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://admin.dasherhelp.com", "https://portal.dasherhelp.com", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
from app.routes import admin_auth, dashboard, scanner, portal_auth, portal_mail, portal_users  # noqa: E402

app.include_router(admin_auth.router, prefix="/api/admin", tags=["admin-auth"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(scanner.router, prefix="/api", tags=["scanner"])
app.include_router(portal_auth.router, prefix="/api/portal", tags=["portal-auth"])
app.include_router(portal_mail.router, prefix="/api/portal", tags=["portal-mail"])
app.include_router(portal_users.router, prefix="/api/portal-users", tags=["portal-users"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
