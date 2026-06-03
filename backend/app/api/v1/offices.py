import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.office import Office, Room
from app.models.workspace import Workspace, WorkspaceMember
from app.models.user import User
from app.schemas.office import OfficeOut, OfficeCreate, RoomOut, RoomCreate, RoomUpdate
from app.api.deps import get_current_user

router = APIRouter(prefix="/offices", tags=["offices"])

DEFAULT_ROOMS = [
    {"name": "Lobby",        "room_type": "lobby",   "position_x": 0,    "position_z": 0,    "width": 12, "depth": 8,  "config": {"color": "#6366f1", "emoji": "🚪"}},
    {"name": "CEO Room",     "room_type": "ceo",     "position_x": -20,  "position_z": -16,  "width": 10, "depth": 10, "config": {"color": "#f59e0b", "emoji": "👔"}},
    {"name": "BA Room",      "room_type": "ba",      "position_x": 0,    "position_z": -16,  "width": 10, "depth": 10, "config": {"color": "#10b981", "emoji": "📊"}},
    {"name": "Dev Room",     "room_type": "dev",     "position_x": 20,   "position_z": -16,  "width": 10, "depth": 10, "config": {"color": "#3b82f6", "emoji": "💻"}},
    {"name": "DBA Room",     "room_type": "dba",     "position_x": 20,   "position_z": 0,    "width": 10, "depth": 10, "config": {"color": "#8b5cf6", "emoji": "🗄️"}},
    {"name": "QA Room",      "room_type": "qa",      "position_x": 20,   "position_z": 16,   "width": 10, "depth": 10, "config": {"color": "#ef4444", "emoji": "🔍"}},
    {"name": "RAG Library",  "room_type": "rag",     "position_x": -20,  "position_z": 16,   "width": 10, "depth": 10, "config": {"color": "#ec4899", "emoji": "📚"}},
    {"name": "Meeting Room", "room_type": "meeting", "position_x": -20,  "position_z": 0,    "width": 10, "depth": 10, "config": {"color": "#06b6d4", "emoji": "🤝"}},
]

DEFAULT_AGENTS = [
    {"name": "Alex",    "agent_type": "reception", "room_type": "lobby",   "position_x": 0,    "position_z": 0,   "system_prompt": "You are Alex, the Reception Agent. You greet users, understand their needs, and route them to the right team."},
    {"name": "Victor",  "agent_type": "ceo",       "room_type": "ceo",     "position_x": -20,  "position_z": -16, "system_prompt": "You are Victor, the CEO Agent. You oversee strategy, prioritize work, and make high-level decisions."},
    {"name": "Bailey",  "agent_type": "ba",        "room_type": "ba",      "position_x": 0,    "position_z": -16, "system_prompt": "You are Bailey, the Business Analyst. You gather requirements, write specs, and bridge business and tech."},
    {"name": "Dev",     "agent_type": "dev",       "room_type": "dev",     "position_x": 20,   "position_z": -16, "system_prompt": "You are Dev, the Developer Agent. You write clean, production-ready code and review pull requests."},
    {"name": "Dana",    "agent_type": "dba",       "room_type": "dba",     "position_x": 20,   "position_z": 0,   "system_prompt": "You are Dana, the DBA Agent. You design schemas, optimize queries, and manage database migrations."},
    {"name": "Quinn",   "agent_type": "qa",        "room_type": "qa",      "position_x": 20,   "position_z": 16,  "system_prompt": "You are Quinn, the QA Agent. You write tests, find bugs, and ensure quality before release."},
    {"name": "Sage",    "agent_type": "rag",       "room_type": "rag",     "position_x": -20,  "position_z": 16,  "system_prompt": "You are Sage, the Knowledge Agent. You search the knowledge base and provide accurate citations."},
]


async def _get_workspace(workspace_id: uuid.UUID, user: User, db: AsyncSession) -> Workspace:
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(Workspace.id == workspace_id, WorkspaceMember.user_id == user.id)
    )
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


@router.get("/workspace/{workspace_id}", response_model=list[OfficeOut])
async def list_offices(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_workspace(workspace_id, current_user, db)
    result = await db.execute(
        select(Office)
        .options(selectinload(Office.rooms))
        .where(Office.workspace_id == workspace_id, Office.is_active == True)
    )
    return [OfficeOut.model_validate(o) for o in result.scalars().all()]


@router.post("/workspace/{workspace_id}", response_model=OfficeOut, status_code=201)
async def create_office(
    workspace_id: uuid.UUID,
    data: OfficeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_workspace(workspace_id, current_user, db)

    office = Office(workspace_id=workspace_id, name=data.name, description=data.description, theme=data.theme)
    db.add(office)
    await db.flush()

    rooms = []
    for r in DEFAULT_ROOMS:
        room = Room(office_id=office.id, description=r["name"], **r)
        db.add(room)
        rooms.append(room)

    await db.flush()
    # Refresh to load server_default values (created_at etc.)
    await db.refresh(office)
    for room in rooms:
        await db.refresh(room)
    from app.schemas.office import RoomOut
    return OfficeOut(
        id=office.id,
        workspace_id=office.workspace_id,
        name=office.name,
        description=office.description,
        theme=office.theme,
        config=office.config,
        is_active=office.is_active,
        created_at=office.created_at,
        rooms=[RoomOut.model_validate(r) for r in rooms],
    )


@router.get("/{office_id}", response_model=OfficeOut)
async def get_office(
    office_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Office).options(selectinload(Office.rooms)).where(Office.id == office_id)
    )
    office = result.scalar_one_or_none()
    if not office:
        raise HTTPException(status_code=404, detail="Office not found")
    return OfficeOut.model_validate(office)


@router.patch("/rooms/{room_id}", response_model=RoomOut)
async def update_room(
    room_id: uuid.UUID,
    data: RoomUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    for field, value in data.model_dump(exclude_none=True).items():
        if field == "config":
            room.config = {**room.config, **value}
        else:
            setattr(room, field, value)

    return RoomOut.model_validate(room)
