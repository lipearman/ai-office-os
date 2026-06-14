from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
from app.core.config import settings
from app.core.database import init_db
from app.core.redis import close_redis
from app.api.v1 import auth, workspaces, health, offices, agents, conversations, seed, uploads, tools, knowledge, workflows, memories, observability, audit, meetings, trading
from app.websocket.router import router as ws_router
import structlog
import traceback

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting AI Office OS", version=settings.VERSION)
    await init_db()
    yield
    await close_redis()
    log.info("Shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def debug_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    log.error("Unhandled exception", path=str(request.url), error=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": tb if settings.DEBUG else None},
    )


app.include_router(health.router,         prefix="/api/v1")
app.include_router(auth.router,           prefix="/api/v1")
app.include_router(workspaces.router,     prefix="/api/v1")
app.include_router(offices.router,        prefix="/api/v1")
app.include_router(agents.router,         prefix="/api/v1")
app.include_router(conversations.router,  prefix="/api/v1")
app.include_router(seed.router,           prefix="/api/v1")
app.include_router(uploads.router,        prefix="/api/v1")
app.include_router(tools.router,          prefix="/api/v1")
app.include_router(knowledge.router,      prefix="/api/v1")
app.include_router(workflows.router,       prefix="/api/v1")
app.include_router(memories.router,        prefix="/api/v1")
app.include_router(observability.router,   prefix="/api/v1")
app.include_router(audit.router,           prefix="/api/v1")
app.include_router(meetings.router,        prefix="/api/v1")
app.include_router(trading.router,         prefix="/api/v1")
app.include_router(ws_router)

# Serve uploaded files
Path("uploads").mkdir(exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory="uploads"), name="uploads")
