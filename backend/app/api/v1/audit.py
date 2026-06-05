import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.audit import AuditLog
from app.models.user import User
from app.api.deps import get_current_user
from app.core.security_rbac import get_workspace_role

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/workspace/{workspace_id}")
async def list_audit(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(AuditLog).where(AuditLog.workspace_id == workspace_id)
        .order_by(AuditLog.created_at.desc()).limit(100)
    )
    logs = res.scalars().all()
    return {"logs": [
        {"id": str(l.id), "actor": l.actor, "action": l.action,
         "target_type": l.target_type, "target_id": l.target_id,
         "status": l.status, "detail": l.detail, "created_at": l.created_at.isoformat()}
        for l in logs
    ]}


@router.get("/role/workspace/{workspace_id}")
async def my_role(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = await get_workspace_role(db, workspace_id, current_user.id)
    return {"role": role.value if role else None}
