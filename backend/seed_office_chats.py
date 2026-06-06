"""
Seed rich, multi-turn "office chat" conversations for every agent so the
/office view and FloatingAgentChat have realistic content to display.

Idempotent: deletes any existing "Office chat" conversations first, then
recreates them — so you can re-run safely at any time.

Run from backend/ with the venv:
    .venv\\Scripts\\python.exe seed_office_chats.py
"""
import asyncio
from sqlalchemy import select, delete

from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.workspace import Workspace
from app.models.agent import Agent
from app.models.conversation import Conversation, Message, MessageRole

TITLE = "Office chat"

# agent_type → list of (role, content) tuples  (USER = work colleague / system)
# Written to feel like real team communication captured as a chat log.
CHATS: dict[str, list[tuple[str, str]]] = {
    "reception": [
        ("USER",      "มีลูกค้าใหม่เข้ามาช่วงเช้าไหมครับ?"),
        ("ASSISTANT", "มีครับ 3 ราย — 2 รายสอบถามสถานะออเดอร์ 1 รายขอเปิด ticket ใหม่ กำลังจัดส่งต่อให้ทีมดูแลแล้ว 🙋"),
        ("USER",      "ticket เก่าที่ค้างอยู่ล่ะ?"),
        ("ASSISTANT", "มี 5 ticket ที่ค้างเกิน 24 ชั่วโมงครับ กำลัง follow-up ทีละรายเลย"),
        ("USER",      "ขอบคุณ รบกวน escalate ถ้ามีอะไรด่วนนะ"),
        ("ASSISTANT", "รับทราบครับ จะแจ้งทันที มีอะไรอื่นให้ช่วยไหมครับ? ✅"),
    ],
    "pm": [
        ("USER",      "อัปเดต roadmap Q3 หน่อยได้ไหม?"),
        ("ASSISTANT", "อนุมัติ roadmap Q3 แล้วครับ โฟกัส 3 เรื่อง: Customer Portal, API Gateway, และ Mobile App 🚀"),
        ("USER",      "timeline tight ไหม? Dev พร้อมรับงานหรือยัง?"),
        ("ASSISTANT", "Dev แจ้งว่าพร้อมแล้วครับ รอ spec จาก BA อยู่ 1 จุด น่าจะ kick-off ได้สัปดาห์หน้า"),
        ("USER",      "risk อะไรที่ต้องระวัง?"),
        ("ASSISTANT", "มี 2 dependency ครับ: QA bandwidth ช่วงปลาย sprint กับ infra capacity — กำลังวางแผน mitigation อยู่"),
    ],
    "ceo": [
        ("USER",      "ภาพรวมสัปดาห์นี้เป็นอย่างไรบ้าง?"),
        ("ASSISTANT", "ทีมเดินหน้าได้ดีครับ Customer Portal sprint 2 ผ่าน 85% velocity เป้า Q3 ยังอยู่ใน track"),
        ("USER",      "มีปัญหาอะไรที่ต้องตัดสินใจไหม?"),
        ("ASSISTANT", "มีเรื่อง budget เพิ่มสำหรับ cloud infra ครับ ขอ approve เพิ่ม 15% เพื่อรองรับ traffic spike"),
        ("USER",      "approve ได้เลย จัดการต่อได้"),
        ("ASSISTANT", "ขอบคุณครับ จะแจ้ง DevOps ดำเนินการวันนี้ 👔"),
    ],
    "ba": [
        ("USER",      "spec หน้า Orders เสร็จหรือยัง?"),
        ("ASSISTANT", "ร่าง acceptance criteria เสร็จแล้วครับ ครอบคลุม: paginated list, status filter, download invoice, และ empty state 📋"),
        ("USER",      "ส่ง Dev ได้เลยไหม? มีอะไรค้างอยู่ไหม?"),
        ("ASSISTANT", "ได้เลยครับ มีแค่ error state บน network timeout ที่ยังรอ confirm จาก PO อยู่ 1 จุด"),
        ("USER",      "PO confirm แล้ว — เดินหน้าได้เลย"),
        ("ASSISTANT", "เยี่ยมเลยครับ ส่ง spec ให้ Dev ทันที จะ create ticket ใน backlog ด้วย ✅"),
    ],
    "dev": [
        ("USER",      "login feature คืบหน้าไหม?"),
        ("ASSISTANT", "merge login API branch เรียบร้อยครับ ใช้ JWT + refresh token ตาม spec ส่ง PR review แล้ว 💻"),
        ("USER",      "role-based access ล่ะ?"),
        ("ASSISTANT", "implement `require_role` dependency เสร็จแล้วครับ ทดสอบ admin/support/customer roles ผ่านหมด กำลัง write unit test อยู่"),
        ("USER",      "QA จะ pull ได้เมื่อไหร่?"),
        ("ASSISTANT", "พรุ่งนี้เช้าได้เลยครับ กำลัง fix lint warning อยู่ 2 จุด น่าจะ push staging คืนนี้ 🚀"),
    ],
    "dba": [
        ("USER",      "DB performance เป็นยังไงบ้าง?"),
        ("ASSISTANT", "optimize query orders แล้วครับ เร็วขึ้น 40% เพิ่ม index บน `orders.user_id` และ `orders.status` 🗄️"),
        ("USER",      "migration plan สำหรับ Q3 ล่ะ?"),
        ("ASSISTANT", "วางแผน 3 migration ครับ: สร้างตาราง invoices, index optimization รอบสอง, และ archive policy สำหรับ orders เก่ากว่า 1 ปี"),
        ("USER",      "rollback plan มีไหม?"),
        ("ASSISTANT", "มีครับ ทุก migration มี `downgrade()` พร้อม และ backup ก่อน run เสมอ ✅"),
    ],
    "qa": [
        ("USER",      "test login flow เสร็จแล้วไหม?"),
        ("ASSISTANT", "รัน regression ผ่าน 48/50 ครับ เหลือ 2 edge case: unicode email กับ rate limit บน slow network กำลัง investigate 🔍"),
        ("USER",      "ETA แก้เสร็จ?"),
        ("ASSISTANT", "น่าจะแก้เสร็จภายใน 2 ชั่วโมงครับ จะ report ผลทันที"),
        ("USER",      "โอเค รอฟัง ถ้าผ่านหมดก็ merge ได้เลย"),
        ("ASSISTANT", "รับทราบครับ ถ้า pass จะแจ้ง Dev ให้ merge เลย และขึ้น staging ภายในวันนี้ ✅"),
    ],
    "rag": [
        ("USER",      "knowledge base อัปเดตหรือยัง?"),
        ("ASSISTANT", "index เอกสารใหม่ 6 ไฟล์เรียบร้อยครับ: PRD, API Guide, Test Plan, Schema Notes, SLA Policy, และ Onboarding Doc 📚"),
        ("USER",      "ค้นหา JWT spec ให้หน่อย"),
        ("ASSISTANT", "พบ 3 เอกสารที่เกี่ยวข้องครับ: API Style Guide (หน้า 3), PRD auth section, และ Security Guideline — ต้องการ snippet ไหมครับ?"),
        ("USER",      "เอา summary สั้นๆ พอ"),
        ("ASSISTANT", "ได้เลยครับ: ใช้ JWT Bearer token, access token หมดใน 15 นาที, refresh token 7 วัน, เก็บใน httpOnly cookie 📄"),
    ],
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

        # --- delete existing "Office chat" convs (idempotent reset) ---
        old_convs = (await db.execute(
            select(Conversation).where(
                Conversation.workspace_id == ws.id,
                Conversation.user_id == admin.id,
                Conversation.title == TITLE,
            )
        )).scalars().all()

        for conv in old_convs:
            await db.execute(
                delete(Message).where(Message.conversation_id == conv.id)
            )
            await db.delete(conv)
        if old_convs:
            await db.flush()
            print(f"  deleted {len(old_convs)} old '{TITLE}' conversation(s)")

        # --- seed fresh conversations ---
        added = 0
        for agent in agents:
            lines = CHATS.get(agent.agent_type)
            if not lines:
                continue

            conv = Conversation(
                workspace_id=ws.id,
                agent_id=agent.id,
                user_id=admin.id,
                title=TITLE,
            )
            db.add(conv)
            await db.flush()

            for role_str, content in lines:
                role = MessageRole.USER if role_str == "USER" else MessageRole.ASSISTANT
                db.add(Message(conversation_id=conv.id, role=role, content=content))

            added += 1

        await db.commit()
        print(f"+ seeded '{TITLE}' for {added} agent(s) "
              f"({', '.join(CHATS.keys())})")


if __name__ == "__main__":
    asyncio.run(main())
