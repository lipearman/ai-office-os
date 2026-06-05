import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.memory import Memory
from app.models.user import User
from app.api.deps import get_current_user
from app.rag.memory import store_memory, recall

router = APIRouter(prefix="/memories", tags=["memories"])


class MemoryIn(BaseModel):
    workspace_id: uuid.UUID
    content: str
    kind: str = "fact"
    agent_id: uuid.UUID | None = None
    importance: float = 1.5


class RecallIn(BaseModel):
    workspace_id: uuid.UUID
    query: str
    agent_id: uuid.UUID | None = None
    top_k: int = 5


@router.get("/workspace/{workspace_id}")
async def list_memories(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(Memory).where(Memory.workspace_id == workspace_id)
        .order_by(Memory.created_at.desc()).limit(100)
    )
    return {"memories": [
        {"id": str(m.id), "kind": m.kind, "content": m.content,
         "importance": m.importance, "agent_id": str(m.agent_id) if m.agent_id else None,
         "created_at": m.created_at.isoformat()}
        for m in res.scalars().all()
    ]}


@router.post("")
async def add_memory(
    data: MemoryIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    mem = await store_memory(
        db, str(data.workspace_id), content=data.content, kind=data.kind,
        agent_id=str(data.agent_id) if data.agent_id else None,
        user_id=str(current_user.id), importance=data.importance,
    )
    return {"id": str(mem.id), "content": mem.content}


@router.post("/recall")
async def recall_memories(
    data: RecallIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = await recall(
        db, str(data.workspace_id), data.query,
        agent_id=str(data.agent_id) if data.agent_id else None, top_k=data.top_k,
    )
    return {"results": items}


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(select(Memory).where(Memory.id == memory_id))
    mem = res.scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.delete(mem)
    return {"deleted": str(memory_id)}
