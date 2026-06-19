from langgraph.graph import StateGraph
from app.trading.state import DeskState
from app.trading.nodes import (
    node_monitor,
    node_analyst,
    node_news,
    node_trader,
    node_risk,
    node_exec,
    node_coach,
    node_summary,
)

_compiled: StateGraph | None = None


def _route_monitor(state: DeskState) -> str:
    coins = state.get("ranked_coins") or []
    return "analyst" if coins else "__end__"


def _route_coach(state: DeskState) -> str:
    coins = state.get("ranked_coins") or []
    idx = state.get("coin_index", 0)
    return "news" if idx < len(coins) else "summary"


def build_desk_graph():
    g = StateGraph(DeskState)

    g.add_node("monitor", node_monitor)
    g.add_node("analyst", node_analyst)
    g.add_node("news", node_news)
    g.add_node("trader", node_trader)
    g.add_node("risk", node_risk)
    g.add_node("exec", node_exec)
    g.add_node("coach", node_coach)
    g.add_node("summary", node_summary)

    g.set_entry_point("monitor")
    g.add_conditional_edges("monitor", _route_monitor, {
        "analyst": "analyst",
        "__end__": "__end__",
    })
    g.add_edge("analyst", "news")
    g.add_edge("news", "trader")
    g.add_edge("trader", "risk")
    g.add_edge("risk", "exec")
    g.add_edge("exec", "coach")
    g.add_conditional_edges("coach", _route_coach, {
        "news": "news",
        "summary": "summary",
    })
    g.add_edge("summary", "__end__")

    return g.compile()


def get_graph():
    global _compiled
    if _compiled is None:
        _compiled = build_desk_graph()
    return _compiled
