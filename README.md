# 🏢 AI Office OS

> **Operating System for AI Workforce**
> A multi-agent platform where AI agents live and work together in a 2D RPG-style office — chat, run tools, search knowledge, build workflows, hold meetings, and remember.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![Phaser](https://img.shields.io/badge/Phaser-3.90-845EC2)
![Python](https://img.shields.io/badge/Python-3.12-3776AB)
![E2E](https://img.shields.io/badge/E2E-16%2F16%20passing-success)

---

## ✨ What it is

AI Office OS is **not** just a chatbot. It's a full platform that combines:

- 🤖 **AI Team** — 8 specialized agents (Reception, CEO, PM, BA, Dev, DBA, QA, RAG) with distinct personas, powered by LangGraph
- 🎮 **2D RPG Office** — a Phaser game world where agent sprites walk around, with an in-browser editor (background, furniture, character sprite uploads, collision)
- 💬 **Realtime Chat** — talk to any agent, SSE streaming, WebSocket presence/typing
- 🔧 **Tool System** — 7 built-in tools (HTTP, webhook, n8n, SQL, GitHub, calculator, datetime) with a human-approval gate
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
| **Frontend** | Next.js 15, TypeScript, TailwindCSS, Zustand, React Flow |
| **Office Game** | Phaser 3.90 (2D RPG renderer) |
| **Backend** | FastAPI, SQLAlchemy (async), LangGraph, LangChain |
| **AI / LLM** | OpenAI · Gemini · OpenRouter · Ollama (auto-detected; graceful fallback with no key) |
| **Database** | PostgreSQL 16 (embeddings stored as JSON — no pgvector required) |
| **Realtime** | WebSocket + Server-Sent Events |

---

## 🗂️ Project Structure

```
ai-office-os/
├── backend/                      # FastAPI app
│   └── app/
│       ├── main.py               # entry point, routers
│       ├── core/                 # config, db, security, rbac
│       ├── models/               # 18 SQLAlchemy models
│       ├── api/v1/               # auth, agents, tools, knowledge,
│       │                         #   workflows, memories, meetings,
│       │                         #   observability, audit, …
│       ├── agents/               # LangGraph runtime (graph, prompts, tools, llm)
│       ├── tools/                # tool registry + built-ins
│       ├── rag/                  # embeddings, knowledge search, memory
│       └── observability/        # usage tracker
├── frontend/                     # Next.js app
│   ├── public/assets/            # game sprites (maps, furniture, characters)
│   └── src/
│       ├── app/(dashboard)/      # 13 pages
│       ├── components/phaser/    # Phaser office scene + editor bridge
│       └── store/                # Zustand stores
├── tools/                        # PIL asset generators + e2e_test.ps1
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
npm install --legacy-peer-deps
npm run dev
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

`/api/v1/` — `auth` · `workspaces` (+members) · `agents` · `offices` · `conversations` (chat + SSE) · `tools` · `knowledge` · `workflows` · `memories` · `meetings` · `observability` · `audit` · `uploads` · `seed` · WebSocket `/ws/{workspace_id}`

Full interactive docs: **http://localhost:8000/docs**

---

## 🗺️ Roadmap — all 12 phases shipped ✅

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Foundation (auth, DB, API, WS) | ✅ |
| 2–3 | Office world + realtime chat | ✅ |
| 4 | Multi-agent core (LangGraph) | ✅ |
| 5 | Tool system | ✅ |
| 6 | RAG & Knowledge Hub | ✅ |
| 7 | Visual Workflow Builder | ✅ |
| 8 | Office Builder (Phaser editor) | ✅ |
| 9 | Memory system | ✅ |
| 10 | Observability | ✅ |
| 11 | Security (RBAC + audit) | ✅ |
| 12 | Advanced AI (AI Meeting) | ✅ |

---

## 📄 License

MIT

<div align="center"><sub>Built with ❤️ — an Operating System for your AI workforce</sub></div>
