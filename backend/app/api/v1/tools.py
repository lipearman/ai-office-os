import uuid
import time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.tool import ToolLog, ToolStatus
from app.models.user import User
from app.api.deps import get_current_user
from app.tools.registry import tool_catalog, get_tool
import app.tools  # noqa: F401 — registers built-in tools

router = APIRouter(prefix="/tools", tags=["tools"])


class ToolRunIn(BaseModel):
    workspace_id: uuid.UUID
    tool_name: str
    params: dict = {}
    approved: bool = False


@router.get("")
async def list_tools(current_user: User = Depends(get_current_user)):
    return {"tools": tool_catalog()}


@router.post("/run")
async def run_tool(
    data: ToolRunIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tool = get_tool(data.tool_name)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Unknown tool: {data.tool_name}")

    # Human approval gate
    if tool.requires_approval and not data.approved:
        log = ToolLog(
            workspace_id=data.workspace_id, user_id=current_user.id,
            tool_name=data.tool_name, params=data.params,
            status=ToolStatus.PENDING_APPROVAL,
        )
        db.add(log)
        await db.flush()
        return {"status": "pending_approval", "tool": data.tool_name,
                "message": "This tool requires approval. Re-run with approved=true.",
                "log_id": str(log.id)}

    # Validate required params
    for p, spec in tool.params.items():
        if spec.get("required") and p not in data.params:
            raise HTTPException(status_code=400, detail=f"Missing required param: {p}")

    start = time.perf_counter()
    try:
        result = await tool.executor(data.params)
        status = ToolStatus.ERROR if (isinstance(result, dict) and result.get("error")) else ToolStatus.SUCCESS
        error = result.get("error") if isinstance(result, dict) else None
    except Exception as e:
        result, status, error = None, ToolStatus.ERROR, str(e)
    duration = (time.perf_counter() - start) * 1000

    log = ToolLog(
        workspace_id=data.workspace_id, user_id=current_user.id,
        tool_name=data.tool_name, params=data.params, result=result,
        status=status, error=error, duration_ms=duration,
    )
    db.add(log)
    await db.flush()

    return {"status": status.value.lower(), "result": result, "error": error,
            "duration_ms": round(duration, 1), "log_id": str(log.id)}


@router.get("/logs/workspace/{workspace_id}")
async def tool_logs(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ToolLog).where(ToolLog.workspace_id == workspace_id)
        .order_by(ToolLog.created_at.desc()).limit(50)
    )
    logs = result.scalars().all()
    return {"logs": [
        {"id": str(l.id), "tool_name": l.tool_name, "status": l.status.value,
         "params": l.params, "result": l.result, "error": l.error,
         "duration_ms": l.duration_ms, "created_at": l.created_at.isoformat()}
        for l in logs
    ]}
