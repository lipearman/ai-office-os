"""Workspace RBAC + audit logging helpers."""
import uuid
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.workspace import WorkspaceMember, WorkspaceRole
from app.models.audit import AuditLog
from app.models.user import User

# role hierarchy (higher index = more privilege)
ROLE_RANK = {
    WorkspaceRole.VIEWER: 0,
    WorkspaceRole.MEMBER: 1,
    WorkspaceRole.ADMIN: 2,
    WorkspaceRole.OWNER: 3,
}


async def get_workspace_role(db: AsyncSession, workspace_id, user_id) -> WorkspaceRole | None:
    res = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    m = res.scalar_one_or_none()
    return m.role if m else None


async def require_role(db: AsyncSession, workspace_id, user: User, minimum: WorkspaceRole):
    """Raise 403 if the user's workspace role is below `minimum`."""
    role = await get_workspace_role(db, workspace_id, user.id)
    if role is None or ROLE_RANK[role] < ROLE_RANK[minimum]:
        await record_audit(db, workspace_id, user, action="rbac.denied",
                           status="denied", detail={"required": minimum.value,
                                                    "have": role.value if role else None})
        raise HTTPException(status_code=403,
                            detail=f"Requires {minimum.value} role (you are {role.value if role else 'not a member'})")
    return role


async def record_audit(
    db: AsyncSession, workspace_id, user: User | None, *,
    action: str, target_type: str | None = None, target_id: str | None = None,
    status: str = "ok", detail: dict | None = None,
):
    log = AuditLog(
        workspace_id=workspace_id if isinstance(workspace_id, uuid.UUID) else (uuid.UUID(workspace_id) if workspace_id else None),
        user_id=user.id if user else None,
        actor=(user.full_name or user.email) if user else None,
        action=action, target_type=target_type, target_id=target_id,
        status=status, detail=detail or {},
    )
    db.add(log)
    await db.flush()
    return log
