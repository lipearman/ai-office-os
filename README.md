# 🏢 AI Office OS

> **Operating System for AI Workforce**  
> Multi-Agent Platform in a 3D Office — Build, Manage, and Collaborate with AI Teams

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![Python](https://img.shields.io/badge/Python-3.12-3776AB)

---

## ✨ Vision

AI Office OS is not just another chatbot or workflow tool.  
It is a **full AI Operating System** — a 3D virtual office where AI agents live, work, and collaborate as a team.

- 🤖 **AI Team** — Multiple specialized agents working together
- ⚡ **AI Workflow** — Visual drag-and-drop workflow builder
- 📚 **AI Knowledge** — Enterprise RAG with multi-source ingestion
- 🔧 **AI Automation** — Connect to n8n, APIs, SQL, MCP tools
- 🌐 **AI Collaboration** — Realtime multi-user workspace
- 🏗️ **AI Workspace** — Fully config-driven, extensible like an OS

---

## 🖼️ Tech Stack

### Frontend
| Tech | Purpose |
|------|---------|
| Next.js 15 | App framework |
| TypeScript | Type safety |
| TailwindCSS | Styling |
| React Three Fiber + Three.js | 3D Office rendering |
| Zustand | State management |
| React Flow | Workflow builder |
| Socket.IO Client | Realtime communication |

### Backend
| Tech | Purpose |
|------|---------|
| FastAPI | REST API + WebSocket |
| SQLAlchemy (async) | ORM |
| LangGraph | Multi-Agent runtime |
| LangChain | LLM tooling |
| Celery + Redis | Background tasks |
| Alembic | DB migrations |

### AI / LLM
| Provider | Usage |
|----------|-------|
| Ollama | Local LLM (GPU) |
| Gemini | Google AI |
| OpenRouter | Multi-model access |
| OpenAI-compatible | Any OpenAI API |

### Infrastructure
| Tech | Purpose |
|------|---------|
| PostgreSQL + pgvector | Main DB + Vector search |
| Redis | Cache + Message broker |
| Docker Compose | Local orchestration |
| Vercel | Frontend hosting |
| Ubuntu + Docker | Backend hosting |

---

## 🏛️ System Architecture

```
Next.js 3D Office (Frontend)
         ↓
  FastAPI Gateway (REST + WebSocket)
         ↓
  LangGraph Runtime
         ↓
     Agent Layer
    ┌────┴────────────┐
    │   Tool Layer    │
    ├─ RAG            │
    ├─ SQL            │
    ├─ MCP            │
    ├─ n8n            │
    ├─ GitHub         │
    ├─ SharePoint     │
    └─ APIs           │
         ↓
   Memory Layer
         ↓
PostgreSQL / pgvector / Redis
```

---

## 🗺️ Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Foundation (Auth, DB, API, WebSocket) | ✅ Done |
| 2 | 3D Office Engine (Three.js, Rooms, Avatars) | 🔄 Next |
| 3 | Chat + Realtime System | ⏳ Planned |
| 4 | Multi-Agent Core (LangGraph) | ⏳ Planned |
| 5 | Tool System (SQL, MCP, n8n, GitHub) | ⏳ Planned |
| 6 | RAG & Knowledge Hub | ⏳ Planned |
| 7 | Workflow Builder (React Flow) | ⏳ Planned |
| 8 | Office Builder (Drag & Drop) | ⏳ Planned |
| 9 | Memory System | ⏳ Planned |
| 10 | Observability & Monitoring | ⏳ Planned |
| 11 | Security & Enterprise (RBAC, SSO) | ⏳ Planned |
| 12 | Advanced AI (Autonomous, Voice) | ⏳ Planned |

---

## 📁 Project Structure

```
ai-office-os/
├── frontend/                   # Next.js 15 app
│   └── src/
│       ├── app/                # Pages (login, register, dashboard, office...)
│       ├── components/         # UI components + layout
│       ├── store/              # Zustand state (auth, workspace)
│       └── lib/                # API client, utilities
│
├── backend/                    # FastAPI app
│   └── app/
│       ├── main.py             # Entry point
│       ├── core/               # Config, database, security, redis
│       ├── models/             # SQLAlchemy models
│       ├── schemas/            # Pydantic schemas
│       ├── api/v1/             # REST endpoints
│       └── websocket/          # WebSocket manager
│
├── docker-compose.yml          # All services
├── .env.example                # Environment template
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js 20+
- Python 3.12+

### 1. Clone & Configure

```bash
git clone https://github.com/your-username/ai-office-os.git
cd ai-office-os

cp .env.example .env
# Edit .env — fill in your API keys and secrets
```

### 2. Start with Docker (Recommended)

```bash
docker compose up -d
```

Services will be available at:
- **Frontend** → http://localhost:3000
- **Backend API** → http://localhost:8000
- **API Docs** → http://localhost:8000/docs

### 3. Local Development (Alternative)

**Backend:**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Mac/Linux

pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start dev server
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description | Required |
|----------|-------------|----------|
| `POSTGRES_PASSWORD` | PostgreSQL password | ✅ |
| `SECRET_KEY` | JWT signing key (random string) | ✅ |
| `OPENAI_API_KEY` | OpenAI API key | Optional |
| `GEMINI_API_KEY` | Google Gemini API key | Optional |
| `OPENROUTER_API_KEY` | OpenRouter API key | Optional |
| `OLLAMA_BASE_URL` | Ollama server URL | Optional |

---

## 🤖 Default Agents

| Agent | Room | Role |
|-------|------|------|
| Reception | Lobby | Greet users, route requests |
| PM | CEO Room | Project planning, task delegation |
| BA | BA Room | Requirements analysis |
| Developer | Dev Room | Code generation, review |
| DBA | DBA Room | Database queries, optimization |
| QA | QA Room | Testing, validation |
| RAG | Library | Knowledge retrieval |

---

## 🗄️ Database Schema

Core tables:

```
users              workspaces         offices
workspace_members  rooms              office_objects
agents             conversations      messages
tasks              documents          document_chunks
embeddings         memories           audit_logs
```

---

## 📡 API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Refresh token |
| GET | `/api/v1/auth/me` | Current user |
| GET | `/api/v1/workspaces` | List workspaces |
| POST | `/api/v1/workspaces` | Create workspace |
| GET | `/api/v1/health` | Health check |
| WS | `/ws/{workspace_id}?token=...` | WebSocket connection |

Full API docs: http://localhost:8000/docs

---

## 🐳 Docker Services

| Service | Image | Port |
|---------|-------|------|
| postgres | pgvector/pgvector:pg16 | 5432 |
| redis | redis:7-alpine | 6379 |
| backend | (local build) | 8000 |
| frontend | (local build) | 3000 |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "feat: add your feature"`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <strong>Built with ❤️ for the AI-first future</strong>
</div>
