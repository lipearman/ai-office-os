from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    # App
    APP_NAME: str = "AI Office OS"
    VERSION: str = "0.1.0"
    ENVIRONMENT: Literal["development", "production", "test"] = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://aioffice:aioffice_secret@localhost:5432/aioffice_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Security
    SECRET_KEY: str = "dev_secret_key_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # LLM
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = ""   # e.g. "meta-llama/llama-3.1-8b-instruct" — override the default OpenRouter model
    OLLAMA_BASE_URL: str = "http://llm-server:11434"
    # default LLM when an agent doesn't specify one (provider == auto/empty).
    # Self-hosted Ollama by default so the app needs no cloud API key.
    DEFAULT_LLM_PROVIDER: str = "ollama"
    DEFAULT_LLM_MODEL: str = "qwen2.5:7b-instruct"
    # kill-switch for LLM 'color commentary' on the trading desk (worker calls
    # the LLM on each heavy tick when a provider is configured)
    DESK_LLM_ENABLED: bool = True
    # The heavy per-coin LangGraph pipeline (news/trader/coach × N coins ≈ 30+ LLM
    # calls) is opt-in: it's slow on a shared Ollama and emits a coin-centric
    # character set. When OFF, the desk uses deterministic build_desk (the proper
    # 7-role desk) + the light enrich_commentary layer (~1 call) for AI flavor.
    DESK_GRAPH_ENABLED: bool = False
    # max coins the per-coin LLM agents (news/trader/coach) analyze per heavy tick.
    # Each coin ≈ 3 LLM calls; keep small so the tick finishes within the budget.
    DESK_LLM_MAX_COINS: int = 3
    # auto-run the per-coin LangGraph pipeline on its OWN schedule (separate from
    # the desk heavy tick). It only refreshes the step-by-step Pipeline feed — it
    # never overwrites the desk snapshot, so the desk stays fast/deterministic.
    DESK_GRAPH_AUTO: bool = True
    DESK_GRAPH_INTERVAL_SECONDS: int = 300          # how often the auto pipeline runs
    PIPELINE_TICK_TIMEOUT_SECONDS: float = 200.0    # watchdog for one pipeline run
    PIPELINE_LOCK_TTL_SECONDS: int = 240            # single-flight lock auto-release
    # ML vote (XGBoost+Logistic ensemble): an extra confirm/veto on the rule signal.
    # OFF by default — it's heavy (trains per coin), so a background job refreshes a
    # cached P(up) per symbol and the scan only reads the cache (never trains inline).
    DESK_ML_VOTE_ENABLED: bool = False
    ML_VOTE_INTERVAL_SECONDS: int = 1800            # how often the ML refresh job runs
    ML_VOTE_TICK_TIMEOUT_SECONDS: float = 600.0     # watchdog for one ML refresh
    ML_VOTE_TTL_SECONDS: int = 7200                 # cached vote freshness
    ML_VOTE_LOCK_TTL_SECONDS: int = 660             # single-flight lock auto-release
    ML_VOTE_MIN_PROB: float = 0.5                   # below = ML does not confirm
    # auto-pin the coins the ML model likes most (P(up) >= ML_VOTE_MIN_PROB) into the
    # watchlist, non-destructively: only auto-added symbols are managed/pruned —
    # manually-added ones are never touched. Runs inside the ML refresh job.
    AUTO_WATCHLIST_FROM_ML: bool = True
    AUTO_WATCHLIST_TOP_N: int = 5
    # run the desk worker (APScheduler) inside the API process. Set False when
    # running a dedicated worker (`python -m app.trading.worker`) so the ticks
    # don't run twice.
    RUN_WORKER_IN_PROCESS: bool = True
    # desk market discovery: scan the top-N Bitkub THB pairs by 24h volume on top
    # of the watchlist, so movers surface automatically. 0 / False = watchlist only.
    DESK_SCAN_ENABLED: bool = True
    DESK_SCAN_TOP_N: int = 20
    # auto paper-trading: worker opens trades on fresh setups + closes on
    # stop/target. OFF by default (turning it on lets the worker trade on its own).
    AUTO_PAPER_ENABLED: bool = False
    AUTO_PAPER_MAX_POSITIONS: int = 5
    AUTO_PAPER_SIZE_THB: float = 1000.0
    AUTO_PAPER_MIN_WIN_PCT: float = 55.0
    # require a fresh entry signal (signal_today) to auto-open. False = open the
    # top-ranked opportunities by score even without a same-day signal (more
    # aggressive; useful for demos / always-in strategies).
    AUTO_PAPER_REQUIRE_SIGNAL: bool = True
    # per-LLM-call timeout (s) — stops a hung Ollama call from blocking a tick
    LLM_TIMEOUT_SECONDS: float = 30.0
    # overall heavy-tick watchdog (s) — cancel a stuck compute so the next tick
    # can run (prevents "ran once then stopped" from a permanently hung job)
    HEAVY_TICK_TIMEOUT_SECONDS: float = 150.0

    # CORS
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
