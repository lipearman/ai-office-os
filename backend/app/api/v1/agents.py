import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.agent import Agent, AgentStatus
from app.models.user import User
from app.schemas.agent import AgentOut, AgentCreate, AgentUpdate
from app.api.deps import get_current_user

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/llm/options")
async def llm_options(current_user: User = Depends(get_current_user)):
    """Available LLM providers + model choices (Ollama fetched live) for dropdowns."""
    from app.agents.llm import llm_options as _opts
    return await _opts()


@router.get("/workspace/{workspace_id}", response_model=list[AgentOut])
async def list_agents(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Agent).where(Agent.workspace_id == workspace_id, Agent.is_active == True)
    )
    return [AgentOut.model_validate(a) for a in result.scalars().all()]


@router.post("/workspace/{workspace_id}", response_model=AgentOut, status_code=201)
async def create_agent(
    workspace_id: uuid.UUID,
    data: AgentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    agent = Agent(workspace_id=workspace_id, **data.model_dump())
    db.add(agent)
    await db.flush()
    return AgentOut.model_validate(agent)


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return AgentOut.model_validate(agent)


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: uuid.UUID,
    data: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(agent, field, value)

    return AgentOut.model_validate(agent)


@router.patch("/{agent_id}/status")
async def update_agent_status(
    agent_id: uuid.UUID,
    status: AgentStatus,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.status = status
    return {"id": str(agent_id), "status": status}
