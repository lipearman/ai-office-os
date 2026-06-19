import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.agent import Agent, AgentStatus
from app.models.user import User
from app.schemas.agent import AgentOut, AgentCreate, AgentUpdate
from app.api.deps import get_current_user
from app.trading.nodes import (
    _PROMPT_MONITOR, _PROMPT_ANALYST, _PROMPT_NEWS, _PROMPT_TRADER,
    _PROMPT_RISK, _PROMPT_EXEC, _PROMPT_COACH, _PROMPT_SUMMARY,
)

_DEFAULT_PROMPTS: dict[str, str] = {
    "monitor": _PROMPT_MONITOR,
    "analyst": _PROMPT_ANALYST,
    "news": _PROMPT_NEWS,
    "trader": _PROMPT_TRADER,
    "risk": _PROMPT_RISK,
    "exec": _PROMPT_EXEC,
    "coach": _PROMPT_COACH,
    "summary": _PROMPT_SUMMARY,
}

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
    payload = data.model_dump()
    if not payload.get("system_prompt") and payload.get("agent_type") in _DEFAULT_PROMPTS:
        payload["system_prompt"] = _DEFAULT_PROMPTS[payload["agent_type"]]
    agent = Agent(workspace_id=workspace_id, **payload)
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

    updates = data.model_dump(exclude_none=True)
    # if system_prompt is being cleared, fill from default instead
    if "system_prompt" in updates and not updates["system_prompt"] and agent.agent_type in _DEFAULT_PROMPTS:
        updates["system_prompt"] = _DEFAULT_PROMPTS[agent.agent_type]
    for field, value in updates.items():
        setattr(agent, field, value)

    await db.commit()
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
