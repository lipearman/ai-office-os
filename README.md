# 🏢 AI Office OS

> **Operating System for AI Workforce**
> A multi-agent platform where AI agents live and work together — chat, run tools, trade crypto, search knowledge, build workflows, hold meetings, and remember.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![Python](https://img.shields.io/badge/Python-3.12-3776AB)
![E2E](https://img.shields.io/badge/E2E-16%2F16%20passing-success)

---

## ✨ What it is

AI Office OS is **not** just a chatbot. It's a full platform that combines:

- 🤖 **AI Team** — 8 specialized agents (Reception, CEO, PM, BA, Dev, DBA, QA, RAG) with distinct personas, powered by LangGraph
- 🏢 **Trading Office** — live crypto trading desk with 7 agent roles, real-time pipeline, price sparklines, news sentiment, agent meetings, and desk chat
- 💬 **Realtime Chat** — talk to any agent, SSE streaming, WebSocket presence/typing
- 🔧 **Tool System** — built-in tools (HTTP, webhook, n8n, SQL, GitHub, calculator, datetime) with a human-approval gate
- 📚 **RAG Knowledge Hub** — upload PDF/TXT/MD, semantic search with embeddings
- ⚡ **Visual Workflow Builder** — React Flow drag-and-drop agent/tool pipelines
- 🧠 **Long-term Memory** — agents recall relevant past interactions automatically
- 📊 **Observability** — token usage, latency, error tracking dashboard
- 🛡️ **Security** — workspace RBAC (Owner/Admin/Member/Viewer) + audit log
- 👥 **AI Meeting** — multiple agents discuss a topic and produce a summary

---

## 🧱 Tech Stack

| Layer | Tech |
|-------|------|
| **Frontend** | Next.js 15, TypeScript, TailwindCSS, Zustand, React Flow, Recharts |
| **Backend** | FastAPI, SQLAlchemy (async), LangGraph, LangChain |
| **AI / LLM** | OpenAI · Gemini · Anthropic · OpenRouter · Ollama (auto-detected; graceful fallback with no key) |
| **Database** | PostgreSQL 16 (embeddings stored as JSON — no pgvector required) |
| **Realtime** | WebSocket (Redis pub/sub) + Server-Sent Events |
| **Crypto** | Bitkub API (ticker, OHLCV, order book) — Bangkok-based exchange |

---

## 🗂️ Project Structure

```
ai-office-os/
├── backend/                      # FastAPI app
│   └── app/
│       ├── main.py               # entry point, routers
│       ├── core/                 # config, db, security, rbac
│       ├── models/               # 22 SQLAlchemy models
│       ├── api/v1/               # auth, agents, tools, knowledge,
│       │                         #   workflows, memories, meetings,
│       │                         #   trading, observability, audit, …
│       ├── agents/               # LangGraph runtime (graph, prompts, tools, llm)
│       ├── tools/                # tool registry + built-ins
│       ├── trading/              # desk worker, pipeline graph, nodes,
│       │                         #   scheduler, paper trading, Bitkub client
│       ├── rag/                  # embeddings, knowledge search, memory
│       └── observability/        # usage tracker
├── frontend/                     # Next.js app
│   └── src/
│       ├── app/(dashboard)/      # 14 pages (including trading + office)
│       ├── components/office/    # TradingOffice, DraggableBox, bubble engine
│       ├── components/trading/   # PipelineView, watchlist, positions
│       └── store/                # Zustand stores
├── tools/                        # e2e_test.ps1 + generators
└── docs/                         # master plan + reference art
```

---

## 🚀 Getting Started (Windows, local — no Docker)

> The project also ships a `docker-compose.yml`, but the documented dev flow runs everything locally.

### Prerequisites
- Node.js 20+, Python 3.12+
- PostgreSQL 16 (+ Redis optional). Create db `aioffice_db`, user `aioffice` / `aioffice_secret`.

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy ..\.env .env          # fill in LLM keys (optional)
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
pnpm install
pnpm dev
```

Open **http://localhost:3000** — API docs at **http://localhost:8000/docs**.

### First login
Register a user, **or** use the seeded test account:

| Email | Password |
|-------|----------|
| `admin@example.com` | `Admin1234!` |

(The login page has a one-click "Test Account" button.)

---

## 🔑 Environment (`backend/.env`)

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | Postgres async URL | ✅ |
| `SECRET_KEY` | JWT signing | ✅ |
| `OPENAI_API_KEY` | OpenAI (chat + embeddings) | optional |
| `GEMINI_API_KEY` / `OPENROUTER_API_KEY` | other providers | optional |
| `OLLAMA_BASE_URL` | local LLM | optional |

Without any LLM key, agents return a friendly fallback and embeddings use a deterministic local hash — the app still runs end-to-end.

---

## 🤖 Default Agents

| Agent | Role | Room |
|-------|------|------|
| Alex (Reception) | greet & route | Lobby |
| Victor (PM/CEO) | planning, priorities | CEO Room |
| Bailey (BA) | requirements, specs | BA Room |
| Dev | code, architecture | Dev Room |
| Dana (DBA) | schemas, SQL | DBA Room |
| Quinn (QA) | testing, bugs | QA Room |
| Sage (RAG) | knowledge retrieval | Library |

---

## 🏢 Trading Office

The **Trading Office** (`/office`) is a live crypto trading command center powered by a background worker pipeline.

### Desk Agents (7 roles)

| Agent | Emoji | Role |
|-------|-------|------|
| **Trader** | 🤖 | Entry/exit analysis, entry zones |
| **Market Analyst** | 📊 | Market bias, support/resistance |
| **News & Sentiment** | 📰 | News aggregation, sentiment scoring |
| **Risk Officer** | 🛡️ | Portfolio risk, position sizing |
| **Coach** | 🎯 | Strategic advice, discipline |
| **Model Monitor** | 📉 | Opportunity scanning, win rate |
| **Execution Reviewer** | 🔍 | Backtest verification, quality check |

### How it works

1. **Watchlist** — configure symbols on the Trading page (`/trading`)
2. **Scheduler** — lightweight tick (20s) updates prices/sparklines; heavy tick (180s) runs the full pipeline
3. **Pipeline** — LangGraph walks through Monitor → Analyst → News → Trader → Risk → Exec → Coach per coin, then Summary
4. **Agent Meeting** — after pipeline completes, all 7 agents generate LLM-powered meeting commentary displayed as speech bubbles
5. **Desk Chat** — ask questions about pipeline data; all agents collaborate on the answer
6. **Floating Panels** — price table with sparklines, news headlines with sentiment indicators, pipeline feed; all draggable & minimizable

### Per-agent LLM Config

Each desk agent can use a different LLM provider/model via the edit-mode panel, or set all at once.

### Screenshots

Open `http://localhost:3000/office` after login and completing a pipeline run.

---

## 🎮 Office Editor

Open **Office → "แก้ไข Office"**:
- **Background** — upload any image (live swap, agents stay)
- **Furniture** — 16 generated presets + upload your own; editable catalog (rename / replace image / delete); drag to place; **collision** (agents walk around furniture)
- **Characters** — upload a sprite sheet per agent (RPG-Maker `cols×4 rows` = down/left/right/up → agents face their walking direction)

---

## 🧪 Testing

End-to-end smoke test (backend must be running):

```powershell
pwsh tools/e2e_test.ps1
```

Covers auth, agents, tools, RAG, memory, workflows, observability, RBAC, audit, team — **16/16 passing**.

---

## 📡 API Overview

`/api/v1/` — `auth` · `workspaces` (+members) · `agents` · `offices` · `conversations` (chat + SSE) · `tools` · `knowledge` · `workflows` · `memories` · `meetings` · `trading` (watchlist, paper trades, desk snapshot, desk LLM config, alerts, webhooks, agent meeting, desk chat) · `observability` · `audit` · `uploads` · `seed` · WebSocket `/ws/{workspace_id}`

Full interactive docs: **http://localhost:8000/docs**

---

## 🗺️ Roadmap — all 13 phases shipped ✅

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Foundation (auth, DB, API, WS) | ✅ |
| 2–3 | Office world + realtime chat | ✅ |
| 4 | Multi-agent core (LangGraph) | ✅ |
| 5 | Tool system | ✅ |
| 6 | RAG & Knowledge Hub | ✅ |
| 7 | Visual Workflow Builder | ✅ |
| 8 | Office Editor | ✅ |
| 9 | Memory system | ✅ |
| 10 | Observability | ✅ |
| 11 | Security (RBAC + audit) | ✅ |
| 12 | Advanced AI (AI Meeting) | ✅ |
| 13 | **Trading Desk** — pipeline, realtime, paper trading, agent meeting, desk chat | ✅ |

---

## 📄 License

MIT

<div align="center"><sub>Built with ❤️ — an Operating System for your AI workforce</sub></div>
