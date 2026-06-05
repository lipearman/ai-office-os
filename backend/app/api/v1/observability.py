import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.event import UsageEvent
from app.models.tool import ToolLog
from app.models.user import User
from app.api.deps import get_current_user

router = APIRouter(prefix="/observability", tags=["observability"])


@router.get("/summary/workspace/{workspace_id}")
async def summary(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(UsageEvent).where(UsageEvent.workspace_id == workspace_id))
    events = res.scalars().all()

    total_calls = len(events)
    total_tokens = sum(e.total_tokens for e in events)
    prompt_tokens = sum(e.prompt_tokens for e in events)
    completion_tokens = sum(e.completion_tokens for e in events)
    errors = sum(1 for e in events if e.status == "error")
    avg_latency = round(sum(e.latency_ms for e in events) / total_calls, 1) if total_calls else 0.0

    # per-agent breakdown
    by_agent: dict[str, dict] = {}
    for e in events:
        k = e.agent_name or "—"
        a = by_agent.setdefault(k, {"calls": 0, "tokens": 0, "latency": 0.0, "errors": 0})
        a["calls"] += 1; a["tokens"] += e.total_tokens
        a["latency"] += e.latency_ms; a["errors"] += 1 if e.status == "error" else 0
    agents = [
        {"agent": k, "calls": v["calls"], "tokens": v["tokens"],
         "avg_latency": round(v["latency"] / v["calls"], 1) if v["calls"] else 0,
         "errors": v["errors"]}
        for k, v in sorted(by_agent.items(), key=lambda kv: kv[1]["tokens"], reverse=True)
    ]

    # last 7 days token series
    now = datetime.now(timezone.utc)
    days = [(now - timedelta(days=i)).date() for i in range(6, -1, -1)]
    series = {d.isoformat(): 0 for d in days}
    for e in events:
        d = e.created_at.date().isoformat()
        if d in series:
            series[d] += e.total_tokens
    token_series = [{"date": d, "tokens": series[d]} for d in series]

    # tool runs count
    tres = await db.execute(select(func.count()).select_from(ToolLog).where(ToolLog.workspace_id == workspace_id))
    tool_runs = tres.scalar() or 0

    return {
        "totals": {
            "calls": total_calls, "total_tokens": total_tokens,
            "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens,
            "errors": errors, "avg_latency_ms": avg_latency, "tool_runs": tool_runs,
        },
        "by_agent": agents,
        "token_series": token_series,
    }


@router.get("/events/workspace/{workspace_id}")
async def events(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(UsageEvent).where(UsageEvent.workspace_id == workspace_id)
        .order_by(UsageEvent.created_at.desc()).limit(50)
    )
    return {"events": [
        {"id": str(e.id), "kind": e.kind, "model": e.model, "agent": e.agent_name,
         "prompt_tokens": e.prompt_tokens, "completion_tokens": e.completion_tokens,
         "total_tokens": e.total_tokens, "latency_ms": round(e.latency_ms, 1),
         "status": e.status, "error": e.error, "created_at": e.created_at.isoformat()}
        for e in res.scalars().all()
    ]}
