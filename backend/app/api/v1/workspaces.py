import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.models.user import User
from app.schemas.workspace import WorkspaceCreate, WorkspaceOut, WorkspaceUpdate
from app.api.deps import get_current_user

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    data: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Workspace).where(Workspace.slug == data.slug))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already exists")

    workspace = Workspace(
        name=data.name,
        slug=data.slug,
        description=data.description,
    )
    db.add(workspace)
    await db.flush()

    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=current_user.id,
        role=WorkspaceRole.OWNER,
    )
    db.add(member)

    return WorkspaceOut.model_validate(workspace)


@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == current_user.id, Workspace.is_active == True)
    )
    return [WorkspaceOut.model_validate(w) for w in result.scalars().all()]


@router.get("/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return WorkspaceOut.model_validate(workspace)


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
async def update_workspace(
    workspace_id: uuid.UUID,
    data: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(workspace, field, value)

    return WorkspaceOut.model_validate(workspace)


# ── Members ──────────────────────────────────────────────────────────────────

from pydantic import BaseModel, EmailStr


class MemberAddIn(BaseModel):
    email: str
    role: WorkspaceRole = WorkspaceRole.MEMBER


@router.get("/{workspace_id}/members")
async def list_members(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
    )
    return {"members": [
        {"id": str(m.id), "user_id": str(u.id), "name": u.full_name,
         "email": u.email, "role": m.role.value, "avatar_url": u.avatar_url}
        for m, u in res.all()
    ]}


@router.post("/{workspace_id}/members")
async def add_member(
    workspace_id: uuid.UUID,
    data: MemberAddIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.security_rbac import require_role, record_audit
    await require_role(db, workspace_id, current_user, WorkspaceRole.ADMIN)

    ures = await db.execute(select(User).where(User.email == data.email))
    user = ures.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="No user with that email")

    exists = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already a member")

    m = WorkspaceMember(workspace_id=workspace_id, user_id=user.id, role=data.role)
    db.add(m)
    await record_audit(db, workspace_id, current_user, action="member.add",
                       target_type="user", target_id=str(user.id),
                       detail={"email": data.email, "role": data.role.value})
    await db.flush()
    return {"id": str(m.id), "email": data.email, "role": data.role.value}


@router.patch("/{workspace_id}/members/{member_id}")
async def update_member_role(
    workspace_id: uuid.UUID,
    member_id: uuid.UUID,
    data: MemberAddIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.security_rbac import require_role, record_audit
    await require_role(db, workspace_id, current_user, WorkspaceRole.ADMIN)
    res = await db.execute(select(WorkspaceMember).where(WorkspaceMember.id == member_id))
    m = res.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    m.role = data.role
    await record_audit(db, workspace_id, current_user, action="member.role",
                       target_type="member", target_id=str(member_id),
                       detail={"role": data.role.value})
    return {"id": str(m.id), "role": data.role.value}


@router.delete("/{workspace_id}/members/{member_id}")
async def remove_member(
    workspace_id: uuid.UUID,
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.security_rbac import require_role, record_audit
    await require_role(db, workspace_id, current_user, WorkspaceRole.ADMIN)
    res = await db.execute(select(WorkspaceMember).where(WorkspaceMember.id == member_id))
    m = res.scalar_one_or_none()
    if m:
        await db.delete(m)
        await record_audit(db, workspace_id, current_user, action="member.remove",
                           target_type="member", target_id=str(member_id))
    return {"deleted": str(member_id)}
