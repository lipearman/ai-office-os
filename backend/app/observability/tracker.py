"""Lightweight usage tracking — records token/latency/error events."""
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.event import UsageEvent


def estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars/token) for providers without usage data."""
    return max(1, len(text or "") // 4)


async def record_usage(
    db: AsyncSession, workspace_id: str, *,
    kind: str = "chat", model: str = "auto",
    agent_id: str | None = None, agent_name: str | None = None,
    user_id: str | None = None,
    prompt_text: str = "", completion_text: str = "",
    prompt_tokens: int | None = None, completion_tokens: int | None = None,
    latency_ms: float = 0.0, status: str = "success", error: str | None = None,
) -> None:
    pt = prompt_tokens if prompt_tokens is not None else estimate_tokens(prompt_text)
    ct = completion_tokens if completion_tokens is not None else estimate_tokens(completion_text)
    ev = UsageEvent(
        workspace_id=uuid.UUID(workspace_id) if workspace_id else None,
        agent_id=uuid.UUID(agent_id) if agent_id else None,
        user_id=uuid.UUID(user_id) if user_id else None,
        kind=kind, model=model, agent_name=agent_name,
        prompt_tokens=pt, completion_tokens=ct, total_tokens=pt + ct,
        latency_ms=latency_ms, status=status, error=error,
    )
    db.add(ev)
    await db.flush()
