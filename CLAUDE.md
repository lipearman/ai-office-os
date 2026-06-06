# AI Office OS

Config-driven multi-agent platform shown as a 2D RPG office. Next.js frontend + FastAPI backend + LangGraph agents.

## Run (Windows, local — no Docker)

**Backend** (port 8000):
```bash
cd backend
.venv\Scripts\activate
alembic upgrade head            # apply migrations
uvicorn app.main:app --reload --port 8000
```

**Frontend** (port 3000):
```bash
cd frontend
npm run dev                     # Next 15 + Turbopack
```

**Test login:** `admin@example.com` / `Admin1234!` (login page has a one-click "Test Account" button).
**Seed demo data:** `cd backend && .venv\Scripts\python.exe seed_demo.py` (idempotent).

## Checks
- Frontend types: `cd frontend && npm run type-check` (3 *pre-existing* errors are known & harmless: ChatPanel SYSTEM compare, legacy `components/office/OfficeScene.tsx` drei Fog, PhaserOffice `online` status compare).
- E2E smoke (backend must run): `pwsh tools/e2e_test.ps1` — 16 checks.

## Stack
- **Frontend:** Next 15 (App Router), TypeScript, Tailwind, Zustand (persist), React Flow (workflows), **Phaser 3** (the /office 2D game — chosen over Three.js/custom-canvas).
- **Backend:** FastAPI, SQLAlchemy async, Alembic, LangGraph + LangChain, JWT, **bcrypt 4.2.1 directly** (passlib removed — incompatible with bcrypt 5).
- **DB:** PostgreSQL 16 (`aioffice` / `aioffice_secret` / `aioffice_db` :5432). Embeddings stored as **JSON** (no pgvector). LLM auto-detect: OpenAI → Gemini → OpenRouter → Ollama → deterministic fallback (runs end-to-end with no API key).

## Conventions (important)
- **DB enum values are UPPERCASE** (e.g. `MEMBER`, `IDLE`, `USER`, `ACTIVE`, `SUCCESS`). Models must match.
- API routes are workspace-scoped: `/api/v1/<resource>/workspace/{workspace_id}`.
- FastAPI validation errors come back as arrays — handle that shape in the UI (don't render the object directly).
- Async relationships: `await db.refresh(obj)` before touching a lazy relation (avoids greenlet error).

## Theme
Phaser "Create"-inspired: dark gradient (blue→teal→green) wallpaper, floating dark-translucent panels, **primary = pink `#ff2d75`**, **accent = cyan `#22d3ee`**. Defined in `frontend/tailwind.config.ts` + `globals.css` (`.neon-panel`). Nav is a **top bar + dropdown** (`components/layout/topbar.tsx`), not a sidebar.

## Office game (`/office`)
- `components/phaser/OfficeScene.ts` — Phaser scene. Live setters: `changeBackground`, `updateAgentSprite`, `syncFurniture`, `setEditorMode`, plus settings: `setCharScale / setWalkSpeed / setShowLabels / setCollision`. Sprite sheets are RPG-Maker `cols × 4 rows` (down/left/right/up).
- `components/phaser/PhaserOffice.tsx` — React bridge. Boots Phaser **once** (never recreate — keeps agents alive); applies asset/settings changes live.
- `store/officeGame.ts` — persisted config (`office-game-config-v7`): background, furniture, catalog, agentSprites, **settings** (charScale, walkSpeed, showLabels, collision). `partialize` skips `blob:` URLs.
- Editor (`แก้ไข Office` button) is a Phaser-style tabbed panel: ฉากหลัง / ตัวละคร / เฟอร์นิเจอร์ / ตั้งค่า.

## Layout notes
- Dashboard pages: wrap content in `animate-fade-in mx-auto w-full max-w-6xl` (grids) or narrower + `mx-auto` (forms) — centered, not left-glued.
- Full-bleed pages (office, workflows) use `absolute inset-0` inside the `relative` `<main>` (top bar is 56px; don't use `h-screen`).

## Tooling
- `tools/` — PIL asset generators (`gen_furniture.py`, `normalize_sprite.py`, `extract_walk_sheets.py`) + `e2e_test.ps1`.
- Git remote `lipearman/ai-office-os.git`. Commit/push only when asked.
