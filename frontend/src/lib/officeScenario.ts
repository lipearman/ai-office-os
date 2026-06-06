// Scripted office conversation — a USE-CASE MOCK that plays in realtime so the
// /office page feels alive before real AI agents are wired up.
// Each turn is "spoken" by the agent of the given type; agents map by agent_type.

export interface SimTurn {
  agentType: string; // matches Agent.agent_type (reception, pm, ba, dev, dba, qa, rag)
  text: string;
}

export const OFFICE_SCENARIO: SimTurn[] = [
  { agentType: "reception", text: "มีลูกค้าใหม่อยากได้ระบบ Customer Portal ครับ 🙋" },
  { agentType: "pm",        text: "โอเค ขอ BA ช่วยเก็บ requirement ก่อนนะครับ" },
  { agentType: "ba",        text: "ได้ค่ะ โฟกัสหน้า Login กับ Orders เป็นหลัก 📋" },
  { agentType: "dev",       text: "ผมเริ่มทำ API login (JWT + refresh token) เลยนะ 💻" },
  { agentType: "dba",       text: "ฝั่งฐานข้อมูล ผมเตรียม schema orders / invoices ให้ 🗄️" },
  { agentType: "dev",       text: "ต่อ endpoint /orders ให้ดึงตาม customer เรียบร้อย ✅" },
  { agentType: "qa",        text: "เดี๋ยวผมเขียนเทสต์ login + orders ครับ เป้า 50 เคส 🔍" },
  { agentType: "rag",       text: "อัปเดต knowledge base เอกสาร API ใหม่ให้แล้วครับ 📚" },
  { agentType: "pm",        text: "เยี่ยมมาก! ตั้งเป้า demo ภายใน Q3 ลุยกันต่อ 🚀" },
  { agentType: "reception", text: "จะแจ้งลูกค้าว่าทีมเริ่มงานแล้วนะครับ 😊" },
];
