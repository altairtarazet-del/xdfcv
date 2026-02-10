import asyncpg
from app.config import settings

pool: asyncpg.Pool | None = None


async def init_db():
    global pool
    # statement_cache_size=0 required for Supabase PgBouncer pooler compatibility
    pool = await asyncpg.create_pool(
        settings.database_url, min_size=2, max_size=10, statement_cache_size=0
    )


async def close_db():
    global pool
    if pool:
        await pool.close()
        pool = None


def get_pool() -> asyncpg.Pool:
    assert pool is not None, "Database pool not initialized"
    return pool
