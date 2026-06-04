"""Built-in tools registered into the registry."""
import asyncio
import json
from datetime import datetime, timezone
from app.tools.registry import register, ToolDef
from app.core.config import settings


async def _http_request(params: dict) -> dict:
    import httpx
    method = (params.get("method") or "GET").upper()
    url = params["url"]
    headers = params.get("headers") or {}
    body = params.get("body")
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.request(method, url, headers=headers, json=body if body else None)
        text = resp.text[:4000]
        try:
            data = resp.json()
        except Exception:
            data = None
        return {"status_code": resp.status_code, "body": data if data is not None else text}


async def _webhook(params: dict) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(params["url"], json=params.get("payload") or {})
        return {"status_code": resp.status_code, "ok": resp.is_success}


async def _n8n_trigger(params: dict) -> dict:
    import httpx
    base = params.get("base_url") or settings.__dict__.get("N8N_BASE_URL", "")
    webhook_path = params["webhook_path"]
    url = f"{base.rstrip('/')}/{webhook_path.lstrip('/')}" if base else webhook_path
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=params.get("payload") or {})
        try: data = resp.json()
        except Exception: data = resp.text[:2000]
        return {"status_code": resp.status_code, "result": data}


async def _sql_query(params: dict) -> dict:
    """Run a READ-ONLY SQL query against the app database (SELECT only)."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal
    q = (params.get("query") or "").strip()
    if not q.lower().startswith("select"):
        return {"error": "Only SELECT queries are allowed"}
    if ";" in q.rstrip(";"):
        return {"error": "Multiple statements not allowed"}
    async with AsyncSessionLocal() as db:
        result = await db.execute(text(q + " LIMIT 200"))
        rows = [dict(r._mapping) for r in result.fetchall()]
        # JSON-safe
        return {"rows": json.loads(json.dumps(rows, default=str)), "count": len(rows)}


async def _github_search(params: dict) -> dict:
    import httpx
    q = params["query"]
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get("https://api.github.com/search/repositories",
                                params={"q": q, "per_page": 5},
                                headers={"Accept": "application/vnd.github+json"})
        data = resp.json()
        items = [{"name": i["full_name"], "stars": i["stargazers_count"], "url": i["html_url"],
                  "desc": i.get("description")} for i in data.get("items", [])[:5]]
        return {"results": items}


async def _calculator(params: dict) -> dict:
    expr = params["expression"]
    allowed = set("0123456789+-*/().% ")
    if not all(c in allowed for c in expr):
        return {"error": "Invalid characters"}
    try:
        return {"result": eval(expr, {"__builtins__": {}})}
    except Exception as e:
        return {"error": str(e)}


async def _now(params: dict) -> dict:
    return {"datetime": datetime.now(timezone.utc).isoformat()}


def register_builtin_tools():
    register(ToolDef(
        name="http_request", label="HTTP Request", icon="🌐", category="web",
        description="Make an HTTP request to any URL (GET/POST/PUT/DELETE).",
        params={"method": {"type": "string", "required": False},
                "url": {"type": "string", "required": True},
                "headers": {"type": "object", "required": False},
                "body": {"type": "object", "required": False}},
        executor=_http_request,
    ))
    register(ToolDef(
        name="webhook", label="Webhook", icon="🪝", category="automation",
        description="POST a payload to a webhook URL.",
        params={"url": {"type": "string", "required": True},
                "payload": {"type": "object", "required": False}},
        executor=_webhook,
    ))
    register(ToolDef(
        name="n8n_trigger", label="n8n Workflow", icon="⚙️", category="automation",
        description="Trigger an n8n workflow via its webhook.",
        params={"base_url": {"type": "string", "required": False},
                "webhook_path": {"type": "string", "required": True},
                "payload": {"type": "object", "required": False}},
        executor=_n8n_trigger,
    ))
    register(ToolDef(
        name="sql_query", label="SQL Query", icon="🗄️", category="data",
        description="Run a read-only SELECT query on the application database.",
        params={"query": {"type": "string", "required": True}},
        executor=_sql_query, requires_approval=True,
    ))
    register(ToolDef(
        name="github_search", label="GitHub Search", icon="🐙", category="dev",
        description="Search GitHub repositories.",
        params={"query": {"type": "string", "required": True}},
        executor=_github_search,
    ))
    register(ToolDef(
        name="calculator", label="Calculator", icon="🧮", category="util",
        description="Evaluate a math expression.",
        params={"expression": {"type": "string", "required": True}},
        executor=_calculator,
    ))
    register(ToolDef(
        name="current_datetime", label="Current Time", icon="🕐", category="util",
        description="Get the current UTC date and time.",
        params={}, executor=_now,
    ))
