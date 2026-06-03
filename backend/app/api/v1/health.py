from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_db
from app.core.redis import get_redis
from app.core.config import settings

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health():
    return {"status": "ok", "version": settings.VERSION, "app": settings.APP_NAME}


@router.get("/full")
async def health_full(db: AsyncSession = Depends(get_db)):
    checks = {"app": "ok", "version": settings.VERSION}

    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {str(e)}"

    try:
        redis = await get_redis()
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {str(e)}"

    all_ok = all(v == "ok" for k, v in checks.items() if k != "version" and k != "app")
    return {"status": "ok" if all_ok else "degraded", **checks}
