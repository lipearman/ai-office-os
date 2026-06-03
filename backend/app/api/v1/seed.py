import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.workspace import Workspace, WorkspaceMember
from app.models.office import Office, Room
from app.models.agent import Agent, AgentStatus
from app.models.user import User
from app.api.deps import get_current_user
from app.agents.prompts import AGENT_PROMPTS

router = APIRouter(prefix="/seed", tags=["seed"])

DEFAULT_AGENTS = [
    {"name": "Alex",   "agent_type": "reception", "room_type": "lobby",   "position_x": 0,   "position_z": 0,   "description": "Reception & Routing Agent"},
    {"name": "Victor", "agent_type": "pm",        "room_type": "ceo",     "position_x": -20, "position_z": -16, "description": "Project Manager Agent"},
    {"name": "Bailey", "agent_type": "ba",        "room_type": "ba",      "position_x": 0,   "position_z": -16, "description": "Business Analyst Agent"},
    {"name": "Dev",    "agent_type": "dev",       "room_type": "dev",     "position_x": 20,  "position_z": -16, "description": "Developer Agent"},
    {"name": "Dana",   "agent_type": "dba",       "room_type": "dba",     "position_x": 20,  "position_z": 0,   "description": "Database Administrator Agent"},
    {"name": "Quinn",  "agent_type": "qa",        "room_type": "qa",      "position_x": 20,  "position_z": 16,  "description": "QA Engineer Agent"},
    {"name": "Sage",   "agent_type": "rag",       "room_type": "rag",     "position_x": -20, "position_z": 16,  "description": "Knowledge Agent"},
]


@router.post("/workspace/{workspace_id}/agents")
async def seed_agents(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Seed default agents for a workspace (only if none exist)."""
    # Check existing agents
    result = await db.execute(
        select(Agent).where(Agent.workspace_id == workspace_id).limit(1)
    )
    if result.scalar_one_or_none():
        return {"message": "Agents already exist", "seeded": 0}

    # Get rooms
    office_result = await db.execute(
        select(Office).where(Office.workspace_id == workspace_id, Office.is_active == True).limit(1)
    )
    office = office_result.scalar_one_or_none()

    rooms_by_type: dict[str, Room] = {}
    if office:
        rooms_result = await db.execute(select(Room).where(Room.office_id == office.id))
        for room in rooms_result.scalars().all():
            rooms_by_type[room.room_type] = room

    seeded = 0
    for cfg in DEFAULT_AGENTS:
        room = rooms_by_type.get(cfg["room_type"])
        agent = Agent(
            workspace_id=workspace_id,
            room_id=room.id if room else None,
            name=cfg["name"],
            agent_type=cfg["agent_type"],
            description=cfg["description"],
            system_prompt=AGENT_PROMPTS[cfg["agent_type"]],
            model_provider="auto",
            model_name="auto",
            status=AgentStatus.IDLE,
            position_x=cfg["position_x"],
            position_y=1.0,
            position_z=cfg["position_z"],
        )
        db.add(agent)
        seeded += 1

    await db.flush()
    return {"message": f"Seeded {seeded} agents", "seeded": seeded}
