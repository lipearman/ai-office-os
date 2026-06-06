"""
Seed short, office-flavored "latest message" per agent so the /office view
has something to show in each speech bubble. SIMULATED data — not produced by
the real agents yet. Idempotent: skips an agent that already has an
"Office update" conversation.

Run from backend/ with the venv:
    .venv\\Scripts\\python.exe seed_office_chats.py
"""
import asyncio
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.workspace import Workspace
from app.models.agent import Agent
from app.models.conversation import Conversation, Message, MessageRole

TITLE = "Office update"

# keyed by agent_type → (user prompt, latest assistant line shown in the bubble)
CHATS = {
    "reception": ("สถานะคิวลูกค้าตอนนี้?", "ลูกค้าใหม่ 3 รายเข้าคิวรออยู่ค่ะ จัดให้แล้ว 🙋"),
    "pm":        ("อัปเดต roadmap หน่อย",   "อนุมัติ roadmap Q3 แล้ว โฟกัส Customer Portal 🚀"),
    "ceo":       ("อัปเดต roadmap หน่อย",   "อนุมัติ roadmap Q3 แล้ว โฟกัส Customer Portal 🚀"),
    "ba":        ("งาน spec ถึงไหนแล้ว",     "ร่าง acceptance criteria หน้า Orders เสร็จแล้ว 📋"),
    "dev":       ("ฟีเจอร์ login คืบหน้าไหม", "merge login API แล้ว รอ QA เทสต์อยู่ 💻"),
    "dba":       ("ฐานข้อมูลโอเคไหม",        "optimize query orders เร็วขึ้น 40% แล้ว 🗄️"),
    "qa":        ("ผลเทสต์เป็นไง",           "รัน regression ผ่าน 48/50 เหลือ edge case 2 เคส 🔍"),
    "rag":       ("knowledge base อัปเดตยัง", "index ความรู้ใหม่ 6 เอกสารเรียบร้อย 📚"),
}


async def main():
    async with AsyncSessionLocal() as db:
        ws = (await db.execute(select(Workspace).limit(1))).scalar_one_or_none()
        if not ws:
            print("No workspace found — log in to the app once to create one.")
            return
        admin = (await db.execute(
            select(User).where(User.email == "admin@example.com")
        )).scalar_one_or_none()
        if not admin:
            print("admin@example.com not found.")
            return

        agents = (await db.execute(
            select(Agent).where(Agent.workspace_id == ws.id)
        )).scalars().all()

        added = 0
        for agent in agents:
            prompt_line = CHATS.get(agent.agent_type)
            if not prompt_line:
                continue
            user_q, assistant_a = prompt_line

            # idempotency: skip if this agent already has an "Office update" conv
            exists = (await db.execute(
                select(Conversation).where(
                    Conversation.workspace_id == ws.id,
                    Conversation.agent_id == agent.id,
                    Conversation.user_id == admin.id,
                    Conversation.title == TITLE,
                )
            )).scalar_one_or_none()
            if exists:
                continue

            conv = Conversation(
                workspace_id=ws.id, agent_id=agent.id,
                user_id=admin.id, title=TITLE,
            )
            db.add(conv)
            await db.flush()
            db.add_all([
                Message(conversation_id=conv.id, role=MessageRole.USER, content=user_q),
                Message(conversation_id=conv.id, role=MessageRole.ASSISTANT, content=assistant_a),
            ])
            added += 1

        await db.commit()
        print(f"+ seeded office-chat for {added} agent(s) (skipped {len(agents) - added} existing/unknown)")


if __name__ == "__main__":
    asyncio.run(main())
