"""Long-term memory store + recall (reuses the embedding service)."""
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.memory import Memory
from app.rag.embeddings import embed_text, cosine


async def store_memory(
    db: AsyncSession, workspace_id: str, content: str,
    embed_source: str | None = None, kind: str = "exchange",
    agent_id: str | None = None, user_id: str | None = None,
    conversation_id: str | None = None, importance: float = 1.0,
) -> Memory:
    emb = await embed_text(embed_source or content)
    mem = Memory(
        workspace_id=uuid.UUID(workspace_id),
        agent_id=uuid.UUID(agent_id) if agent_id else None,
        user_id=uuid.UUID(user_id) if user_id else None,
        conversation_id=uuid.UUID(conversation_id) if conversation_id else None,
        kind=kind, content=content, embedding=emb, importance=importance,
    )
    db.add(mem)
    await db.flush()
    return mem


async def recall(
    db: AsyncSession, workspace_id: str, query: str,
    agent_id: str | None = None, top_k: int = 3, min_score: float = 0.1,
) -> list[dict]:
    q_emb = await embed_text(query)
    stmt = select(Memory).where(Memory.workspace_id == uuid.UUID(workspace_id))
    if agent_id:
        stmt = stmt.where(Memory.agent_id == uuid.UUID(agent_id))
    res = await db.execute(stmt.limit(500))
    mems = res.scalars().all()

    scored = []
    for m in mems:
        if m.embedding:
            s = cosine(q_emb, m.embedding) * (m.importance or 1.0)
            if s >= min_score:
                scored.append((s, m))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        {"score": round(s, 3), "content": m.content, "kind": m.kind,
         "created_at": m.created_at.isoformat()}
        for s, m in scored[:top_k]
    ]


def format_memories(items: list[dict]) -> str:
    if not items:
        return ""
    lines = [f"- {it['content']}" for it in items]
    return "Relevant memory from past interactions:\n" + "\n".join(lines)
