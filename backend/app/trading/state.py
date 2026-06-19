from typing import TypedDict


class DeskState(TypedDict):
    workspace_id: str
    watchlist_items: list[dict]
    prices: dict[str, float]
    positions: list[dict]
    stats: dict
    news_agg: dict | None
    news_summary: str
    ranked_opportunities: list[dict]
    risk_verdict: str
    risk_level: str
    can_trade: bool
    model_verdict: str
    trade_decisions: list[dict]
    trader_message: str
    review_verdict: str
    exec_approved: bool
    exec_quality: float
    coach_message: str
    analyst_message: str
    analyst_levels: str | None
    market_bias: str
    focus_timeframe: str
    characters: list[dict]
    errors: list[str]
    pipeline_status: str
    pipeline_steps: list[dict]
    # --- per-coin pipeline fields ---
    ranked_coins: list[dict]
    coin_index: int
    coin_results: list[dict]
    current_coin: dict | None
    # --- per-agent LLM config (from agents table) ---
    agent_configs: dict
