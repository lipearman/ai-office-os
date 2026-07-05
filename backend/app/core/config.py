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
    # worker tick cadence (were hardcoded in scheduler.py)
    DESK_HEAVY_SECONDS: int = 180                   # full analysis + snapshot
    DESK_FAST_SECONDS: int = 20                     # price-only refresh
    # desk market discovery: scan the top-N Bitkub THB pairs by 24h volume on top
    # of the watchlist, so movers surface automatically. 0 / False = watchlist only.
    DESK_SCAN_ENABLED: bool = True
    DESK_SCAN_TOP_N: int = 20
    # the scan/signal timeframe for discovered coins (watchlist items may still
    # override per coin via cfg). Runtime-tunable (enum) — see tuning.TUNABLE_ENUM.
    DESK_SCAN_TIMEFRAME: str = "1H"
    # per-coin timeframe tuner: coins provably win on different heartbeats (the
    # 8x3 matrix: ADA on 15M, SOL on 4H, NEAR/XRP on 1H). A weekly backtest scan
    # assigns a coin its own TF only when PF/trades/return clear the bars below —
    # everything else stays on DESK_SCAN_TIMEFRAME (anti-overfit fallback).
    PER_COIN_TF_ENABLED: bool = True
    TF_TUNER_MIN_TRADES: int = 5
    TF_TUNER_MIN_PF: float = 1.2
    TF_TUNER_INTERVAL_SECONDS: int = 604800         # rebuild the map weekly
    TF_TUNER_CHECK_SECONDS: int = 21600             # how often the tick checks if due
    TF_TUNER_TIMEOUT_SECONDS: int = 900             # ~60 backtests watchdog
    # delisting denylist: Bitkub's public ticker has NO delisting flag, and a coin
    # flagged for delisting (DE) often shows a volume SPIKE as holders dump it — so
    # volume-ranked discovery happily surfaces a coin you can't actually hold. Drop
    # these from the scan by hand as Bitkub announces delistings. tradingview format
    # (BASE_THB), case-insensitive.
    DESK_SCAN_EXCLUDE_SYMBOLS: list[str] = ["SYND_THB"]
    # market watcher: diff Bitkub's official symbols list daily (a vanished
    # market = delisted -> auto-add to the DB denylist + alert) and run health
    # checks (stale snapshot / empty ML cache -> alert, deduped per day).
    MARKET_WATCH_ENABLED: bool = True
    MARKET_WATCH_INTERVAL_SECONDS: int = 86400      # symbols diff: daily
    HEALTH_CHECK_INTERVAL_SECONDS: int = 1800       # health: every 30 min
    HEALTH_SNAPSHOT_STALE_SECONDS: int = 900        # snapshot older than this = frozen
    # weekly coach: reads closed-trade results (calibration, exit reasons, regime
    # win rate) and nudges the tunable params within their hard bounds — see
    # trading/tuning.py TUNABLE. Deterministic rules decide; LLM only narrates.
    COACH_ENABLED: bool = True
    COACH_INTERVAL_SECONDS: int = 604800            # one tuning pass per week
    COACH_CHECK_SECONDS: int = 21600                # how often the tick checks if due
    COACH_MIN_TRADES: int = 10                      # below this: report only, no tuning
    # Telegram notifications (best-effort, tiered). Empty token = feature off.
    # CHAT_ID may be left empty: it is auto-discovered from getUpdates after the
    # user presses Start on the bot, then cached in Redis.
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    NOTIFY_TIERS: str = "1,2,3,4"                   # which tiers may send at all
    NOTIFY_QUIET_START_HOUR: int = 0                # local (Asia/Bangkok) quiet window:
    NOTIFY_QUIET_END_HOUR: int = 8                  # only tier 1 sends inside it
    NOTIFY_NEWS_MIN_ABS_SENTIMENT: float = 0.5      # tier-3 news bar: |sentiment| >= this
    NOTIFY_NEWS_MIN_COUNT: int = 2                  # ...backed by at least this many headlines
    # early-turn detector: market breadth (fraction of scanned coins green 24h,
    # EMA-smoothed) + non-negative news while the structural regime is still
    # bearish -> soften the EXTRA bearish penalties by half (base gates untouched)
    REGIME_TURN_ENABLED: bool = True
    REGIME_TURN_BREADTH: float = 0.6                # smoothed breadth >= this
    REGIME_TURN_EMA_ALPHA: float = 0.1              # per heavy tick (~1h to converge)
    # pump guard: the pooled ML reads momentum features, so a thin coin that
    # already ran hard looks attractive AFTER the party (EPIC pumped +32% then
    # dumped -40%; the radar pinged mid-dump). A coin up more than MAX% in 24h
    # is a chase, not a setup: it neither auto-pins nor pings the radar. Between
    # WARN% and MAX% the radar still pings but carries an explicit warning.
    RADAR_PUMP_MAX_24H_CHG: float = 20.0
    RADAR_WARN_24H_CHG: float = 10.0
    # auto paper-trading: worker opens trades on fresh setups + closes on
    # stop/target. OFF by default (turning it on lets the worker trade on its own).
    AUTO_PAPER_ENABLED: bool = False
    AUTO_PAPER_MAX_POSITIONS: int = 5
    AUTO_PAPER_SIZE_THB: float = 1000.0
    AUTO_PAPER_MIN_WIN_PCT: float = 55.0
    # catastrophe stop: auto-close ANY open paper position down more than this %,
    # even one without a stop/target (so a position can never bleed indefinitely).
    AUTO_PAPER_MAX_LOSS_PCT: float = 8.0
    # require a fresh entry signal (signal_today) to auto-open. False = open the
    # top-ranked opportunities by score even without a same-day signal (more
    # aggressive; useful for demos / always-in strategies).
    AUTO_PAPER_REQUIRE_SIGNAL: bool = True
    # time stop: a 4H setup should resolve within days — if neither stop nor
    # target is hit by then, the setup is stale; free the slot. 0 = off.
    AUTO_PAPER_MAX_HOLD_HOURS: int = 72
    # move-to-breakeven: once price runs this many R (initial entry→stop
    # distance) in our favor, raise the stop to entry + round-trip fees so a
    # winner can no longer turn into a full loser. 0 = off.
    AUTO_PAPER_BREAKEVEN_AT_R: float = 1.0
    # in a bearish BTC regime a spot-only desk can't short, so longs fight the
    # tide — demand extra ML conviction on top of ML_VOTE_MIN_PROB to open one.
    AUTO_PAPER_BEARISH_ML_EXTRA: float = 0.05
    # ...and extra predicted win% on top of AUTO_PAPER_MIN_WIN_PCT (same idea,
    # rule-side; was a hardcoded +15 in auto_trader)
    AUTO_PAPER_BEARISH_WIN_EXTRA: float = 15.0
    # train ONE model on all scanned coins pooled (features are scale-free
    # ratios) instead of one model per coin: ~20x the training rows makes the
    # per-coin P(up) far less noisy, and one fit is cheaper than twenty.
    # Falls back to per-coin training when off or when pooling fails.
    ML_VOTE_POOLED: bool = True
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
