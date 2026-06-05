import uuid
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.conversation import Conversation, Message, MessageRole, ConversationStatus
from app.models.agent import Agent, AgentStatus
from app.models.user import User
from app.schemas.conversation import ConversationOut, ConversationCreate, MessageOut, MessageCreate
from app.api.deps import get_current_user
from app.websocket.manager import manager

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("/workspace/{workspace_id}", response_model=list[ConversationOut])
async def list_conversations(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(
            Conversation.workspace_id == workspace_id,
            Conversation.user_id == current_user.id,
            Conversation.status == ConversationStatus.ACTIVE,
        )
        .order_by(Conversation.created_at.desc())
        .limit(50)
    )
    return [ConversationOut.model_validate(c) for c in result.scalars().all()]


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation(
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Agent).where(Agent.id == data.agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    conv = Conversation(
        workspace_id=data.workspace_id,
        agent_id=data.agent_id,
        user_id=current_user.id,
        title=f"Chat with {agent.name}",
    )
    db.add(conv)
    await db.flush()

    system_msg = Message(
        conversation_id=conv.id,
        role=MessageRole.SYSTEM,
        content=agent.system_prompt,
    )
    db.add(system_msg)
    await db.flush()
    conv.messages = [system_msg]
    return ConversationOut.model_validate(conv)


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationOut.model_validate(conv)


@router.post("/{conversation_id}/messages", response_model=MessageOut)
async def send_message(
    conversation_id: uuid.UUID,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    agent_result = await db.execute(select(Agent).where(Agent.id == conv.agent_id))
    agent = agent_result.scalar_one_or_none()

    # Save user message
    user_msg = Message(conversation_id=conv.id, role=MessageRole.USER, content=data.content)
    db.add(user_msg)
    if agent:
        agent.status = AgentStatus.BUSY
    await db.flush()

    # Broadcast typing to workspace
    if agent:
        await manager.broadcast_workspace(
            str(conv.workspace_id),
            {"type": "agent.status", "agent_id": str(agent.id), "status": "BUSY"},
        )

    # Run agent
    history = [{"role": m.role.value if hasattr(m.role, 'value') else m.role, "content": m.content}
               for m in conv.messages if m.role != MessageRole.SYSTEM]

    # Recall relevant long-term memory
    from app.rag.memory import recall, store_memory, format_memories
    recalled = await recall(
        db, str(conv.workspace_id), data.content,
        agent_id=str(agent.id) if agent else None, top_k=3,
    )
    memory_context = format_memories(recalled)

    import time as _time
    from app.observability.tracker import record_usage
    _t0 = _time.perf_counter()
    _status, _error = "success", None
    try:
        from app.agents.runtime import run_agent
        reply_text = await run_agent(
            user_message=data.content,
            agent_type=agent.agent_type if agent else "reception",
            agent_id=str(agent.id) if agent else "",
            agent_name=agent.name if agent else "AI",
            workspace_id=str(conv.workspace_id),
            user_id=str(current_user.id),
            conversation_id=str(conv.id),
            history=history,
            memory_context=memory_context,
        )
    except Exception as ex:
        reply_text, _status, _error = f"Error: {ex}", "error", str(ex)
    _latency = (_time.perf_counter() - _t0) * 1000

    # Record usage event (tokens estimated + latency)
    await record_usage(
        db, str(conv.workspace_id), kind="chat",
        model=(agent.model_name if agent else "auto"),
        agent_id=str(agent.id) if agent else None,
        agent_name=agent.name if agent else "AI",
        user_id=str(current_user.id),
        prompt_text=memory_context + data.content + "".join(h["content"] for h in history),
        completion_text=reply_text, latency_ms=_latency,
        status=_status, error=_error,
    )

    assistant_msg = Message(conversation_id=conv.id, role=MessageRole.ASSISTANT, content=reply_text)
    db.add(assistant_msg)
    if agent:
        agent.status = AgentStatus.IDLE

    # Store this exchange as long-term memory (recall by the user's question)
    await store_memory(
        db, str(conv.workspace_id),
        content=f"Q: {data.content}\nA: {reply_text[:500]}",
        embed_source=data.content, kind="exchange",
        agent_id=str(agent.id) if agent else None,
        user_id=str(current_user.id), conversation_id=str(conv.id),
    )
    await db.flush()

    # Broadcast idle status
    if agent:
        await manager.broadcast_workspace(
            str(conv.workspace_id),
            {"type": "agent.status", "agent_id": str(agent.id), "status": "IDLE"},
        )

    return MessageOut.model_validate(assistant_msg)


@router.post("/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: uuid.UUID,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    agent_result = await db.execute(select(Agent).where(Agent.id == conv.agent_id))
    agent = agent_result.scalar_one_or_none()

    # Save user message
    user_msg = Message(conversation_id=conv.id, role=MessageRole.USER, content=data.content)
    db.add(user_msg)
    if agent:
        agent.status = AgentStatus.BUSY
    await db.flush()
    await db.commit()

    history = [{"role": m.role.value if hasattr(m.role, 'value') else m.role, "content": m.content}
               for m in conv.messages if m.role != MessageRole.SYSTEM]

    async def event_stream():
        from app.agents.runtime import stream_agent
        from app.core.database import AsyncSessionLocal

        full_reply = ""
        try:
            async for delta, done in stream_agent(
                user_message=data.content,
                agent_type=agent.agent_type if agent else "reception",
                agent_id=str(agent.id) if agent else "",
                agent_name=agent.name if agent else "AI",
                workspace_id=str(conv.workspace_id),
                user_id=str(current_user.id),
                conversation_id=str(conv.id),
                history=history,
            ):
                if not done:
                    full_reply += delta
                    yield f"data: {json.dumps({'delta': delta, 'done': False})}\n\n"
                else:
                    # Save final message
                    async with AsyncSessionLocal() as save_db:
                        assistant_msg = Message(
                            conversation_id=conv.id,
                            role=MessageRole.ASSISTANT,
                            content=full_reply,
                        )
                        save_db.add(assistant_msg)
                        if agent:
                            agent_row = await save_db.get(Agent, agent.id)
                            if agent_row:
                                agent_row.status = AgentStatus.IDLE
                        await save_db.commit()
                        await save_db.refresh(assistant_msg)
                        msg_id = str(assistant_msg.id)

                    yield f"data: {json.dumps({'delta': '', 'done': True, 'message_id': msg_id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'delta': f'Error: {str(e)}', 'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
