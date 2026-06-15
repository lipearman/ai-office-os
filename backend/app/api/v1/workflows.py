import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.workflow import Workflow, WorkflowRun
from app.models.agent import Agent
from app.models.user import User
from app.api.deps import get_current_user
from app.tools.registry import get_tool
import app.tools  # noqa: F401

router = APIRouter(prefix="/workflows", tags=["workflows"])


class WorkflowIn(BaseModel):
    workspace_id: uuid.UUID
    name: str
    description: str | None = None
    nodes: list = []
    edges: list = []


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    nodes: list | None = None
    edges: list | None = None


class RunIn(BaseModel):
    input: dict = {}


def _serialize(w: Workflow) -> dict:
    return {
        "id": str(w.id), "name": w.name, "description": w.description,
        "nodes": w.nodes, "edges": w.edges, "is_active": w.is_active,
        "created_at": w.created_at.isoformat(),
    }


@router.get("/workspace/{workspace_id}")
async def list_workflows(workspace_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    res = await db.execute(select(Workflow).where(
        Workflow.workspace_id == workspace_id, Workflow.is_active == True
    ).order_by(Workflow.created_at.desc()))
    return {"workflows": [_serialize(w) for w in res.scalars().all()]}


@router.post("")
async def create_workflow(data: WorkflowIn, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    wf = Workflow(workspace_id=data.workspace_id, name=data.name,
                  description=data.description, nodes=data.nodes, edges=data.edges)
    db.add(wf)
    await db.flush()
    return _serialize(wf)


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    res = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    wf = res.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _serialize(wf)


@router.patch("/{workflow_id}")
async def update_workflow(workflow_id: uuid.UUID, data: WorkflowUpdate,
                          db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    res = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    wf = res.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(wf, k, v)
    return _serialize(wf)


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    res = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    wf = res.scalar_one_or_none()
    if wf:
        wf.is_active = False
    return {"deleted": str(workflow_id)}


@router.post("/{workflow_id}/run")
async def run_workflow(workflow_id: uuid.UUID, data: RunIn,
                       db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    res = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    wf = res.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    steps, output, status = await _execute(wf, data.input, db, str(current_user.id))

    run = WorkflowRun(workflow_id=wf.id, workspace_id=wf.workspace_id,
                      status=status, steps=steps, input=data.input, output=output)
    db.add(run)
    await db.flush()
    return {"run_id": str(run.id), "status": status, "steps": steps, "output": output}


async def _execute(wf: Workflow, wf_input: dict, db: AsyncSession, user_id: str):
    """Walk nodes from 'start' following edges; execute agent/tool/condition nodes."""
    nodes = {n["id"]: n for n in wf.nodes}
    edges = wf.edges
    adj: dict[str, list] = {}
    for e in edges:
        adj.setdefault(e["source"], []).append(e)

    start = next((n for n in wf.nodes if n.get("type") == "start"
                  or n.get("data", {}).get("kind") == "start"), None)
    if not start:
        start = wf.nodes[0] if wf.nodes else None
    if not start:
        return [], {"error": "empty workflow"}, "error"

    steps = []
    context = {"input": wf_input, "last": wf_input.get("text", "")}
    current = start
    guard = 0

    while current and guard < 50:
        guard += 1
        kind = current.get("data", {}).get("kind", current.get("type", "unknown"))
        result: dict = {}
        try:
            if kind in ("start", "end"):
                result = {"ok": True}
            elif kind == "agent":
                result = await _run_agent_node(current, context, db)
            elif kind == "tool":
                result = await _run_tool_node(current, context)
            elif kind == "condition":
                result = {"value": context.get("last", "")}
            else:
                result = {"skipped": kind}
        except Exception as ex:
            steps.append({"node": current["id"], "kind": kind, "error": str(ex)})
            return steps, {"error": str(ex)}, "error"

        steps.append({"node": current["id"], "kind": kind, "result": result})
        if "output" in result:
            context["last"] = result["output"]

        if kind == "end":
            break
        outs = adj.get(current["id"], [])
        if not outs:
            break
        current = nodes.get(outs[0]["target"])

    return steps, {"result": context.get("last", "")}, "success"


async def _run_agent_node(node: dict, context: dict, db: AsyncSession) -> dict:
    data = node.get("data", {})
    agent_id = data.get("agent_id")
    prompt = data.get("prompt") or context.get("last", "")
    agent = None
    if agent_id:
        r = await db.execute(select(Agent).where(Agent.id == uuid.UUID(agent_id)))
        agent = r.scalar_one_or_none()
    from app.agents.runtime import run_agent
    reply = await run_agent(
        user_message=str(prompt),
        agent_type=agent.agent_type if agent else "reception",
        agent_id=str(agent.id) if agent else "",
        agent_name=agent.name if agent else "AI",
        workspace_id=str(agent.workspace_id) if agent else "",
        user_id="", conversation_id="", history=[],
        model_provider=agent.model_provider if agent else "auto",
        model_name=agent.model_name if agent else "auto",
    )
    return {"output": reply}


async def _run_tool_node(node: dict, context: dict) -> dict:
    data = node.get("data", {})
    tool = get_tool(data.get("tool_name", ""))
    if not tool:
        return {"error": "unknown tool"}
    params = data.get("params", {})
    res = await tool.executor(params)
    return {"output": res}
