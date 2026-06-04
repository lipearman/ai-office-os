"""Embedding provider — OpenAI if available, else a deterministic local fallback."""
import hashlib
import math
from app.core.config import settings

EMBED_DIM = 256


async def embed_text(text: str) -> list[float]:
    if settings.OPENAI_API_KEY:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.embeddings.create(model="text-embedding-3-small", input=text[:8000])
            return resp.data[0].embedding
        except Exception:
            pass
    return _local_embed(text)


def _local_embed(text: str) -> list[float]:
    """Deterministic bag-of-hashed-words embedding (works with no API key)."""
    vec = [0.0] * EMBED_DIM
    for token in _tokenize(text):
        h = int(hashlib.md5(token.encode()).hexdigest(), 16)
        idx = h % EMBED_DIM
        sign = 1.0 if (h >> 8) % 2 == 0 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _tokenize(text: str) -> list[str]:
    return [t for t in "".join(c.lower() if c.isalnum() else " " for c in text).split() if len(t) > 1]


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def chunk_text(text: str, size: int = 800, overlap: int = 120) -> list[str]:
    text = text.strip()
    if len(text) <= size:
        return [text] if text else []
    chunks = []
    i = 0
    while i < len(text):
        chunk = text[i:i + size]
        chunks.append(chunk)
        i += size - overlap
    return chunks
