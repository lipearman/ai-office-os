from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from app.agents.graph import get_graph
from app.agents.prompts import AGENT_PROMPTS
from app.agents.state import AgentState
import json


async def run_agent(
    user_message: str,
    agent_type: str,
    agent_id: str,
    agent_name: str,
    workspace_id: str,
    user_id: str,
    conversation_id: str,
    history: list[dict],
) -> str:
    """Run the multi-agent graph and return the AI reply."""
    graph = get_graph()

    # Build message history
    lc_messages = []
    for msg in history[-12:]:  # last 12 messages for context
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role in ("assistant", "ASSISTANT"):
            lc_messages.append(AIMessage(content=content))

    lc_messages.append(HumanMessage(content=user_message))

    initial_state: AgentState = {
        "messages":        lc_messages,
        "workspace_id":    workspace_id,
        "agent_type":      agent_type,
        "agent_id":        agent_id,
        "agent_name":      agent_name,
        "user_id":         user_id,
        "conversation_id": conversation_id,
        "current_agent":   agent_type,
        "next_agent":      agent_type,
        "tools_used":      [],
        "thinking":        "",
        "iteration":       0,
        "max_iterations":  3,
    }

    result = await graph.ainvoke(initial_state)

    # Extract last AI message
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage):
            return msg.content

    return "I could not generate a response. Please try again."


async def stream_agent(
    user_message: str,
    agent_type: str,
    agent_id: str,
    agent_name: str,
    workspace_id: str,
    user_id: str,
    conversation_id: str,
    history: list[dict],
):
    """Stream agent response token by token."""
    from app.agents.llm import get_llm
    from app.agents.prompts import AGENT_PROMPTS
    from langchain_core.messages import SystemMessage

    system_prompt = AGENT_PROMPTS.get(agent_type, AGENT_PROMPTS["reception"])
    llm = get_llm()

    lc_messages = [SystemMessage(content=system_prompt)]
    for msg in history[-12:]:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role in ("user", "USER"):
            lc_messages.append(HumanMessage(content=content))
        elif role in ("assistant", "ASSISTANT"):
            lc_messages.append(AIMessage(content=content))
    lc_messages.append(HumanMessage(content=user_message))

    full_text = ""
    async for chunk in llm.astream(lc_messages):
        delta = chunk.content if hasattr(chunk, "content") else str(chunk)
        if delta:
            full_text += delta
            yield delta, False

    yield full_text, True
