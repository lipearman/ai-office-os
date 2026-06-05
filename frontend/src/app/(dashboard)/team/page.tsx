"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Trash2 } from "lucide-react";

const ROLE_COLOR: Record<string, string> = { OWNER: "#f59e0b", ADMIN: "#8b5cf6", MEMBER: "#10b981", VIEWER: "#6b7280" };
const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

export default function TeamPage() {
  const { current } = useWorkspaceStore();
  const [members, setMembers] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [err, setErr] = useState("");

  const load = () => { if (current) api.get(`/workspaces/${current.id}/members`).then(r => setMembers(r.data.members)).catch(()=>{}); };
  useEffect(() => { load(); }, [current]);

  const add = async () => {
    if (!current || !email.trim()) return;
    setErr("");
    try {
      await api.post(`/workspaces/${current.id}/members`, { email, role });
      setEmail(""); load();
    } catch (e: any) { setErr(e.response?.data?.detail || "เพิ่มไม่สำเร็จ"); }
  };

  const changeRole = async (id: string, newRole: string) => {
    await api.patch(`/workspaces/${current!.id}/members/${id}`, { email: "", role: newRole }).catch(()=>{});
    load();
  };
  const remove = async (id: string) => {
    await api.delete(`/workspaces/${current!.id}/members/${id}`).catch(()=>{});
    load();
  };

  return (
    <div className="animate-fade-in max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Users size={22}/> Team</h1>
        <p className="text-white/40 text-sm mt-1">จัดการสมาชิก workspace + role — {members.length} คน</p>
      </div>

      {/* Invite */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-4 mb-6">
        <p className="text-xs text-white/50 mb-2">เพิ่มสมาชิก (ต้องมี user ในระบบแล้ว)</p>
        <div className="flex gap-2">
          <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="email@example.com"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
          <select value={role} onChange={(e)=>setRole(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <Button onClick={add} className="gap-1.5"><UserPlus size={14}/> เพิ่ม</Button>
        </div>
        {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
      </div>

      {/* Member list */}
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600/30 text-sm font-semibold text-primary-200">
              {m.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{m.name}</p>
              <p className="text-xs text-white/40 truncate">{m.email}</p>
            </div>
            <select value={m.role} onChange={(e)=>changeRole(m.id, e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold"
              style={{ color: ROLE_COLOR[m.role] }}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={()=>remove(m.id)} className="text-white/30 hover:text-red-400"><Trash2 size={15}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}
