from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage
import operator


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    workspace_id: str
    agent_type: str
    agent_id: str
    agent_name: str
    user_id: str
    conversation_id: str
    current_agent: str        # which agent is currently active
    next_agent: str           # routing decision
    tools_used: list[str]
    thinking: str             # current reasoning (streamed to UI)
    iteration: int
    max_iterations: int
