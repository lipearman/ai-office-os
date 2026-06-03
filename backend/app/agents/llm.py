from functools import lru_cache
from langchain_core.language_models import BaseChatModel
from app.core.config import settings


@lru_cache(maxsize=1)
def get_llm(provider: str = "auto", model: str = "auto") -> BaseChatModel:
    """Return the best available LLM based on configured API keys."""

    # OpenAI
    if settings.OPENAI_API_KEY and (provider in ("auto", "openai")):
        from langchain_openai import ChatOpenAI
        m = "gpt-4o-mini" if model == "auto" else model
        return ChatOpenAI(model=m, api_key=settings.OPENAI_API_KEY, temperature=0.3, streaming=True)

    # Google Gemini
    if settings.GEMINI_API_KEY and (provider in ("auto", "gemini")):
        from langchain_google_genai import ChatGoogleGenerativeAI
        m = "gemini-1.5-flash" if model == "auto" else model
        return ChatGoogleGenerativeAI(model=m, google_api_key=settings.GEMINI_API_KEY, temperature=0.3)

    # OpenRouter
    if settings.OPENROUTER_API_KEY and (provider in ("auto", "openrouter")):
        from langchain_openai import ChatOpenAI
        m = "meta-llama/llama-3.1-8b-instruct:free" if model == "auto" else model
        return ChatOpenAI(
            model=m,
            api_key=settings.OPENROUTER_API_KEY,
            base_url="https://openrouter.ai/api/v1",
            temperature=0.3,
            streaming=True,
        )

    # Ollama (local)
    try:
        from langchain_ollama import ChatOllama
        m = "llama3.2" if model == "auto" else model
        return ChatOllama(model=m, base_url=settings.OLLAMA_BASE_URL, temperature=0.3)
    except Exception:
        pass

    # Fallback stub
    return _FallbackLLM()


class _FallbackLLM(BaseChatModel):
    """Stub LLM when no provider is configured."""

    @property
    def _llm_type(self) -> str:
        return "fallback"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        from langchain_core.outputs import ChatGeneration, ChatResult
        from langchain_core.messages import AIMessage
        reply = "No LLM provider configured. Please add OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, or start Ollama in your .env file."
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=reply))])

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        return self._generate(messages, stop, run_manager, **kwargs)
