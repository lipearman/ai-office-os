import uuid
from datetime import datetime
from pydantic import BaseModel


class MessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    tokens_used: int
    tool_calls: list
    meta: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    agent_id: uuid.UUID
    user_id: uuid.UUID
    title: str | None
    status: str
    created_at: datetime
    messages: list[MessageOut] = []

    model_config = {"from_attributes": True}


class ConversationCreate(BaseModel):
    agent_id: uuid.UUID
    workspace_id: uuid.UUID


class MessageCreate(BaseModel):
    content: str
