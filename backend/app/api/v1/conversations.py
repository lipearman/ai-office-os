import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.conversation import Conversation, Message, MessageRole
from app.models.agent import Agent, AgentStatus
from app.models.user import User
from app.schemas.conversation import ConversationOut, ConversationCreate, MessageOut, MessageCreate
from app.api.deps import get_current_user
import json
import asyncio

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
            Conversation.status == "active",
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
    # Check agent exists
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

    # Inject system message
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

    # Save user message
    user_msg = Message(
        conversation_id=conv.id,
        role=MessageRole.USER,
        content=data.content,
    )
    db.add(user_msg)
    await db.flush()

    # Mark agent as busy
    agent_result = await db.execute(select(Agent).where(Agent.id == conv.agent_id))
    agent = agent_result.scalar_one_or_none()
    if agent:
        agent.status = AgentStatus.BUSY

    # Generate AI reply
    reply_text = await _generate_reply(agent, conv.messages, data.content)

    assistant_msg = Message(
        conversation_id=conv.id,
        role=MessageRole.ASSISTANT,
        content=reply_text,
    )
    db.add(assistant_msg)

    if agent:
        agent.status = AgentStatus.IDLE

    await db.flush()
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

    user_msg = Message(
        conversation_id=conv.id,
        role=MessageRole.USER,
        content=data.content,
    )
    db.add(user_msg)
    if agent:
        agent.status = AgentStatus.BUSY
    await db.flush()

    full_reply = await _generate_reply(agent, conv.messages, data.content)

    async def event_stream():
        # Stream word by word for realistic feel
        words = full_reply.split()
        buffer = ""
        for i, word in enumerate(words):
            buffer += word + (" " if i < len(words) - 1 else "")
            chunk = {"delta": word + (" " if i < len(words) - 1 else ""), "done": False}
            yield f"data: {json.dumps(chunk)}\n\n"
            await asyncio.sleep(0.04)

        # Save complete message
        assistant_msg = Message(
            conversation_id=conv.id,
            role=MessageRole.ASSISTANT,
            content=full_reply,
        )
        db.add(assistant_msg)
        if agent:
            agent.status = AgentStatus.IDLE
        await db.commit()

        yield f"data: {json.dumps({'delta': '', 'done': True, 'message_id': str(assistant_msg.id)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _generate_reply(agent: Agent | None, history: list, user_input: str) -> str:
    """Generate AI reply — uses configured LLM or fallback."""
    from app.core.config import settings

    if agent and settings.OPENAI_API_KEY:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            messages = [{"role": "system", "content": agent.system_prompt}]
            for msg in history[-10:]:  # last 10 messages
                if msg.role in ("user", "assistant"):
                    messages.append({"role": msg.role, "content": msg.content})
            messages.append({"role": "user", "content": user_input})
            resp = await client.chat.completions.create(
                model=agent.model_name if agent.model_provider == "openai" else "gpt-4o-mini",
                messages=messages,
                max_tokens=1024,
            )
            return resp.choices[0].message.content or ""
        except Exception:
            pass

    if agent and settings.OLLAMA_BASE_URL:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": agent.model_name if agent.model_provider == "ollama" else "llama3.2",
                        "messages": [
                            {"role": "system", "content": agent.system_prompt},
                            {"role": "user", "content": user_input},
                        ],
                        "stream": False,
                    },
                )
                if resp.status_code == 200:
                    return resp.json()["message"]["content"]
        except Exception:
            pass

    # Fallback — rule-based reply
    name = agent.name if agent else "AI"
    return f"Hello! I'm {name}. I received your message: \"{user_input}\". (Connect an LLM provider in .env to enable AI responses.)"
