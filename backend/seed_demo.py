"""
Seed realistic demo data for every page — use case: a software team
building a "Customer Portal" feature.

Run from backend/ with the venv:
    .venv\\Scripts\\python.exe seed_demo.py
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from sqlalchemy import select

from app.models.user import User, UserRole
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.models.agent import Agent
from app.models.conversation import Conversation, Message, MessageRole
from app.models.document import Document, DocumentChunk
from app.models.memory import Memory
from app.models.workflow import Workflow
from app.models.tool import ToolLog, ToolStatus
from app.models.event import UsageEvent
from app.models.audit import AuditLog
from app.rag.embeddings import embed_text, chunk_text


DOCS = [
    ("Customer Portal — PRD", "pdf",
     "Customer Portal Product Requirements. Goal: let customers view orders, "
     "download invoices, and open support tickets. Must support SSO login, "
     "role-based access, and a responsive dashboard. Launch target: Q3. "
     "Success metric: 40% of customers self-serve within 60 days."),
    ("API Style Guide", "md",
     "All REST endpoints use /api/v1 prefix. Use snake_case for JSON fields. "
     "Return 401 for auth failures, 403 for permission errors, 404 for missing "
     "resources. Paginate list endpoints with limit/offset. Prefer async handlers. "
     "Every mutating endpoint must write an audit log entry."),
    ("Database Schema Notes", "text",
     "The platform uses PostgreSQL. Core tables: users, workspaces, orders, "
     "invoices, tickets. Embeddings are stored as JSON to avoid a pgvector "
     "dependency. Use UUID primary keys. Index foreign keys and email columns."),
    ("QA Test Plan — Login", "text",
     "Test cases for login: valid credentials succeed; invalid password returns "
     "401; locked account returns 423; SSO redirect works; rate limit after 5 "
     "failed attempts. Cover edge cases: empty fields, very long inputs, unicode emails."),
]

MEMORIES = [
    ("preference", "The team prefers TypeScript on the frontend and Python on the backend.", 2.0),
    ("fact", "Customer Portal launch deadline is Q3.", 2.0),
    ("fact", "The platform's database is PostgreSQL with JSON-stored embeddings.", 1.5),
    ("preference", "Code reviews require at least one approval before merge.", 1.5),
    ("fact", "Support tickets must be answered within 24 hours (SLA).", 1.5),
    ("preference", "Prefer concise, actionable answers with code examples when relevant.", 1.0),
]

TOOL_RUNS = [
    ("calculator", {"expression": "120 * 0.4"}, {"result": 48.0}, ToolStatus.SUCCESS),
    ("current_datetime", {}, {"datetime": "2026-06-05T09:00:00Z"}, ToolStatus.SUCCESS),
    ("github_search", {"query": "fastapi rbac"}, {"results": [{"name": "x/y", "stars": 1200}]}, ToolStatus.SUCCESS),
    ("calculator", {"expression": "8 * 60 * 0.85"}, {"result": 408.0}, ToolStatus.SUCCESS),
    ("sql_query", {"query": "SELECT count(*) FROM orders"}, None, ToolStatus.PENDING_APPROVAL),
]


async def main():
    async with AsyncSessionLocal() as db:
        ws = (await db.execute(select(Workspace).limit(1))).scalar_one_or_none()
        if not ws:
            print("No workspace found — log in to the app once to create one.")
            return
        admin = (await db.execute(select(User).where(User.email == "admin@example.com"))).scalar_one_or_none()
        agents = (await db.execute(select(Agent).where(Agent.workspace_id == ws.id))).scalars().all()
        by_type = {a.agent_type: a for a in agents}

        # idempotency guard
        existing = (await db.execute(
            select(Document).where(Document.workspace_id == ws.id, Document.title == DOCS[0][0])
        )).scalar_one_or_none()
        if existing:
            print("Demo data already seeded — nothing to do.")
            return

        now = datetime.now(timezone.utc)

        # 1) Knowledge documents (+ embedded chunks)
        for title, source, content in DOCS:
            doc = Document(workspace_id=ws.id, title=title, source=source, content=content)
            db.add(doc); await db.flush()
            for i, c in enumerate(chunk_text(content)):
                emb = await embed_text(c)
                db.add(DocumentChunk(document_id=doc.id, workspace_id=ws.id,
                                     chunk_index=i, content=c, embedding=emb))
            doc.chunk_count = max(1, len(chunk_text(content)))
            doc.is_indexed = True
        print(f"+ {len(DOCS)} knowledge documents")

        # 2) Memories
        for kind, content, imp in MEMORIES:
            emb = await embed_text(content)
            db.add(Memory(workspace_id=ws.id, user_id=admin.id if admin else None,
                          kind=kind, content=content, embedding=emb, importance=imp))
        print(f"+ {len(MEMORIES)} memories")

        # 3) Workflows
        wf1 = Workflow(workspace_id=ws.id, name="Feature Spec Pipeline",
                       description="BA drafts a spec, Dev reviews feasibility.",
                       nodes=[
                           {"id": "start", "position": {"x": 60, "y": 160}, "data": {"kind": "start", "label": "▶️ Start"}},
                           {"id": "ba", "position": {"x": 240, "y": 160}, "data": {"kind": "agent", "label": "🤖 Agent",
                            "agent_id": str(by_type["ba"].id) if "ba" in by_type else None,
                            "prompt": "Draft a short spec for the Customer Portal login."}},
                           {"id": "dev", "position": {"x": 440, "y": 160}, "data": {"kind": "agent", "label": "🤖 Agent",
                            "agent_id": str(by_type["dev"].id) if "dev" in by_type else None,
                            "prompt": "Review the spec for technical feasibility."}},
                           {"id": "end", "position": {"x": 640, "y": 160}, "data": {"kind": "end", "label": "⏹️ End"}},
                       ],
                       edges=[{"id": "e1", "source": "start", "target": "ba", "animated": True},
                              {"id": "e2", "source": "ba", "target": "dev", "animated": True},
                              {"id": "e3", "source": "dev", "target": "end", "animated": True}])
        wf2 = Workflow(workspace_id=ws.id, name="Bug Triage",
                       description="QA triages a bug, Dev proposes a fix.",
                       nodes=[
                           {"id": "start", "position": {"x": 60, "y": 160}, "data": {"kind": "start", "label": "▶️ Start"}},
                           {"id": "qa", "position": {"x": 260, "y": 160}, "data": {"kind": "agent", "label": "🤖 Agent",
                            "agent_id": str(by_type["qa"].id) if "qa" in by_type else None,
                            "prompt": "Triage: login fails with unicode emails."}},
                           {"id": "tool", "position": {"x": 460, "y": 160}, "data": {"kind": "tool", "label": "🔧 Tool",
                            "tool_name": "current_datetime", "params": {}}},
                           {"id": "end", "position": {"x": 660, "y": 160}, "data": {"kind": "end", "label": "⏹️ End"}},
                       ],
                       edges=[{"id": "e1", "source": "start", "target": "qa", "animated": True},
                              {"id": "e2", "source": "qa", "target": "tool", "animated": True},
                              {"id": "e3", "source": "tool", "target": "end", "animated": True}])
        db.add_all([wf1, wf2])
        print("+ 2 workflows")

        # 4) Conversations + messages
        if "dev" in by_type:
            conv = Conversation(workspace_id=ws.id, agent_id=by_type["dev"].id,
                                user_id=admin.id, title="Chat with Dev")
            db.add(conv); await db.flush()
            db.add_all([
                Message(conversation_id=conv.id, role=MessageRole.SYSTEM, content=by_type["dev"].system_prompt),
                Message(conversation_id=conv.id, role=MessageRole.USER, content="How should we structure the Customer Portal login API?"),
                Message(conversation_id=conv.id, role=MessageRole.ASSISTANT, content="Use POST /api/v1/auth/login returning JWT access + refresh tokens. Add rate limiting (5/min), SSO redirect support, and 401/403/423 status codes. Store sessions stateless via JWT."),
                Message(conversation_id=conv.id, role=MessageRole.USER, content="What about role-based access?"),
                Message(conversation_id=conv.id, role=MessageRole.ASSISTANT, content="Define roles: customer, support, admin. Gate endpoints with a require_role dependency, and write an audit log on every privileged action."),
            ])
        if "ba" in by_type:
            conv2 = Conversation(workspace_id=ws.id, agent_id=by_type["ba"].id,
                                 user_id=admin.id, title="Chat with Bailey")
            db.add(conv2); await db.flush()
            db.add_all([
                Message(conversation_id=conv2.id, role=MessageRole.SYSTEM, content=by_type["ba"].system_prompt),
                Message(conversation_id=conv2.id, role=MessageRole.USER, content="Draft acceptance criteria for the orders page."),
                Message(conversation_id=conv2.id, role=MessageRole.ASSISTANT, content="Given a logged-in customer, when they open Orders, they see a paginated list with date, status, total; clicking an order shows line items and a downloadable invoice. Empty state shows a friendly message."),
            ])
        print("+ 2 conversations")

        # 5) Tool logs
        for name, params, result, status in TOOL_RUNS:
            db.add(ToolLog(workspace_id=ws.id, user_id=admin.id, tool_name=name,
                           params=params, result=result, status=status,
                           duration_ms=round(0.5 + (hash(name) % 30) / 10, 1)))
        print(f"+ {len(TOOL_RUNS)} tool logs")

        # 6) Usage events spread over the last 6 days (for the chart)
        names = list(by_type.values())
        for d in range(6, -1, -1):
            for k in range(2 + (6 - d) % 3):
                a = names[(d + k) % len(names)] if names else None
                ts = now - timedelta(days=d, hours=k)
                ev = UsageEvent(
                    workspace_id=ws.id, agent_id=a.id if a else None,
                    agent_name=a.name if a else "AI", user_id=admin.id,
                    kind="chat" if k % 3 else "meeting",
                    model=a.model_name if a else "auto",
                    prompt_tokens=120 + k * 40, completion_tokens=80 + k * 25,
                    total_tokens=200 + k * 65, latency_ms=round(400 + k * 120 + d * 30, 1),
                    status="error" if (d == 2 and k == 1) else "success",
                    error="rate limit" if (d == 2 and k == 1) else None,
                )
                ev.created_at = ts
                db.add(ev)
        print("+ usage events (7-day series)")

        # 7) Audit logs
        for action, tt, ti in [
            ("workspace.create", "workspace", str(ws.id)),
            ("agent.seed", "workspace", str(ws.id)),
            ("document.delete", "document", str(uuid.uuid4())),
            ("tool.run", "tool", "sql_query"),
            ("meeting.run", "meeting", None),
        ]:
            log = AuditLog(workspace_id=ws.id, user_id=admin.id if admin else None,
                           actor=admin.full_name if admin else None,
                           action=action, target_type=tt, target_id=ti, status="ok")
            db.add(log)
        print("+ 5 audit logs")

        # 8) Extra team member
        sarah = (await db.execute(select(User).where(User.email == "sarah@example.com"))).scalar_one_or_none()
        if not sarah:
            sarah = User(email="sarah@example.com", username="sarah", full_name="Sarah Chen",
                         hashed_password=hash_password("Sarah1234!"), role=UserRole.MEMBER, is_verified=True)
            db.add(sarah); await db.flush()
        member = (await db.execute(select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == ws.id, WorkspaceMember.user_id == sarah.id))).scalar_one_or_none()
        if not member:
            db.add(WorkspaceMember(workspace_id=ws.id, user_id=sarah.id, role=WorkspaceRole.ADMIN))
        print("+ team member: Sarah Chen (ADMIN)")

        await db.commit()
        print("\nDemo data seeded successfully.")


if __name__ == "__main__":
    asyncio.run(main())
