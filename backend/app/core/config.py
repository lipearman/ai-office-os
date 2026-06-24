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
    # run the desk worker (APScheduler) inside the API process. Set False when
    # running a dedicated worker (`python -m app.trading.worker`) so the ticks
    # don't run twice.
    RUN_WORKER_IN_PROCESS: bool = True
    # desk market discovery: scan the top-N Bitkub THB pairs by 24h volume on top
    # of the watchlist, so movers surface automatically. 0 / False = watchlist only.
    DESK_SCAN_ENABLED: bool = True
    DESK_SCAN_TOP_N: int = 20

    # CORS
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
