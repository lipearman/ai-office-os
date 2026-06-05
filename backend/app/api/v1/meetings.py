import uuid
import time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.agent import Agent
from app.models.user import User
from app.api.deps import get_current_user
from app.agents.llm import get_llm
from app.agents.prompts import AGENT_PROMPTS
from langchain_core.messages import SystemMessage, HumanMessage

router = APIRouter(prefix="/meetings", tags=["meetings"])


class MeetingIn(BaseModel):
    workspace_id: uuid.UUID
    topic: str
    agent_ids: list[uuid.UUID] = []
    rounds: int = 2


async def _speak(agent: Agent, topic: str, transcript: list[dict]) -> str:
    persona = AGENT_PROMPTS.get(agent.agent_type, AGENT_PROMPTS["reception"])
    convo = "\n".join(f"{t['agent']}: {t['content']}" for t in transcript[-8:])
    sys = (f"{persona}\n\nYou are in a team meeting. Topic: \"{topic}\".\n"
           f"Speak in character as {agent.name}. Respond in 1-3 concise sentences, "
           f"build on the discussion, and add your specialist perspective. "
           f"Do not repeat what others already said.")
    user = f"Discussion so far:\n{convo or '(meeting just started)'}\n\nYour turn, {agent.name}:"
    try:
        llm = get_llm()
        resp = await llm.ainvoke([SystemMessage(content=sys), HumanMessage(content=user)])
        return (resp.content or "").strip()
    except Exception as e:
        return f"({agent.name} could not respond: {e})"


async def _summarize(topic: str, transcript: list[dict]) -> str:
    convo = "\n".join(f"{t['agent']}: {t['content']}" for t in transcript)
    try:
        llm = get_llm()
        resp = await llm.ainvoke([
            SystemMessage(content="You are a meeting facilitator. Summarize the meeting into "
                                  "3-5 concise bullet points with action items."),
            HumanMessage(content=f"Topic: {topic}\n\nTranscript:\n{convo}"),
        ])
        return (resp.content or "").strip()
    except Exception:
        return ""


@router.post("/run")
async def run_meeting(
    data: MeetingIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.agent_ids:
        # default: all active agents in the workspace
        res = await db.execute(select(Agent).where(
            Agent.workspace_id == data.workspace_id, Agent.is_active == True))
        agents = res.scalars().all()
    else:
        res = await db.execute(select(Agent).where(Agent.id.in_(data.agent_ids)))
        agents = res.scalars().all()
    if not agents:
        raise HTTPException(status_code=400, detail="No agents for the meeting")

    agents = agents[:6]
    transcript: list[dict] = []
    t0 = time.perf_counter()

    from app.observability.tracker import record_usage
    for _ in range(max(1, min(data.rounds, 4))):
        for agent in agents:
            content = await _speak(agent, data.topic, transcript)
            transcript.append({"agent": agent.name, "agent_type": agent.agent_type, "content": content})
            await record_usage(
                db, str(data.workspace_id), kind="meeting",
                model=agent.model_name, agent_id=str(agent.id), agent_name=agent.name,
                user_id=str(current_user.id),
                prompt_text=data.topic, completion_text=content, latency_ms=0,
            )

    summary = await _summarize(data.topic, transcript)

    from app.core.security_rbac import record_audit
    await record_audit(db, data.workspace_id, current_user, action="meeting.run",
                       target_type="meeting", detail={"topic": data.topic, "agents": len(agents)})
    await db.flush()

    return {
        "topic": data.topic,
        "participants": [{"name": a.name, "type": a.agent_type} for a in agents],
        "transcript": transcript,
        "summary": summary,
        "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
