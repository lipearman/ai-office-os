from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from app.agents.state import AgentState
from app.agents.prompts import AGENT_PROMPTS, ROUTER_PROMPT
from app.agents.tools import TOOLS_BY_AGENT

VALID_AGENTS = {"reception", "pm", "ba", "dev", "dba", "qa", "rag"}


async def route_message(state: AgentState) -> AgentState:
    """Decide which agent should handle the message."""
    if state.get("agent_type") and state["agent_type"] in VALID_AGENTS:
        target = state["agent_type"]
        return {**state, "current_agent": target, "next_agent": target}

    last_msg = state["messages"][-1]
    user_text = last_msg.content if hasattr(last_msg, "content") else str(last_msg)

    try:
        from app.agents.llm import get_llm
        llm = get_llm()
        resp = await llm.ainvoke([
            SystemMessage(content=ROUTER_PROMPT),
            HumanMessage(content=user_text),
        ])
        agent = resp.content.strip().lower().split()[0]
        if agent not in VALID_AGENTS:
            agent = "reception"
    except Exception:
        agent = "reception"

    return {**state, "current_agent": agent, "next_agent": agent}


def _pick_next(state: AgentState) -> str:
    return state.get("next_agent", "reception")


async def _run_agent(agent_type: str, state: AgentState) -> AgentState:
    from app.agents.llm import get_llm

    system_prompt = AGENT_PROMPTS.get(agent_type, AGENT_PROMPTS["reception"])
    tools = TOOLS_BY_AGENT.get(agent_type, [])

    try:
        llm = get_llm()
        llm_with_tools = llm.bind_tools(tools) if tools else llm
        messages = [SystemMessage(content=system_prompt)] + list(state["messages"])
        resp = await llm_with_tools.ainvoke(messages)

        # Handle tool calls
        if hasattr(resp, "tool_calls") and resp.tool_calls:
            used_tools = list(state.get("tools_used", []))
            tool_results = []
            for tc in resp.tool_calls:
                for t in tools:
                    if t.name == tc["name"]:
                        try:
                            result = t.invoke(tc["args"])
                            tool_results.append(f"[{tc['name']}]: {result}")
                            used_tools.append(tc["name"])
                        except Exception as e:
                            tool_results.append(f"[{tc['name']}] error: {e}")

            messages += [
                AIMessage(content=resp.content or ""),
                HumanMessage(content="Tool results:\n" + "\n".join(tool_results) + "\n\nProvide your final answer."),
            ]
            resp = await llm.ainvoke(messages)
            state = {**state, "tools_used": used_tools}

        agent_name = _display_name(agent_type)
        return {
            **state,
            "messages": [AIMessage(content=resp.content, name=agent_name)],
            "iteration": state.get("iteration", 0) + 1,
        }
    except Exception as e:
        return {
            **state,
            "messages": [AIMessage(content=f"Sorry, I encountered an error: {e}", name=agent_type)],
            "iteration": state.get("iteration", 0) + 1,
        }


def _display_name(t: str) -> str:
    return {"reception": "Alex", "pm": "Victor", "ba": "Bailey",
             "dev": "Dev", "dba": "Dana", "qa": "Quinn", "rag": "Sage"}.get(t, t.title())


async def node_reception(state): return await _run_agent("reception", state)
async def node_pm(state):        return await _run_agent("pm", state)
async def node_ba(state):        return await _run_agent("ba", state)
async def node_dev(state):       return await _run_agent("dev", state)
async def node_dba(state):       return await _run_agent("dba", state)
async def node_qa(state):        return await _run_agent("qa", state)
async def node_rag(state):       return await _run_agent("rag", state)


def build_graph():
    g = StateGraph(AgentState)

    g.add_node("router",    route_message)
    g.add_node("reception", node_reception)
    g.add_node("pm",        node_pm)
    g.add_node("ba",        node_ba)
    g.add_node("dev",       node_dev)
    g.add_node("dba",       node_dba)
    g.add_node("qa",        node_qa)
    g.add_node("rag",       node_rag)

    g.set_entry_point("router")
    g.add_conditional_edges("router", _pick_next, {a: a for a in VALID_AGENTS})
    for a in VALID_AGENTS:
        g.add_edge(a, END)

    return g.compile()


_graph = None

def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph
