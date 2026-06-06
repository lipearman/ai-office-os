"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { Shield, ShieldCheck } from "lucide-react";

const STATUS_COLOR: Record<string, string> = { ok: "#10b981", denied: "#ef4444", error: "#f59e0b" };
const ROLE_COLOR: Record<string, string> = { OWNER: "#f59e0b", ADMIN: "#8b5cf6", MEMBER: "#10b981", VIEWER: "#6b7280" };

export default function SecurityPage() {
  const { current } = useWorkspaceStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    api.get(`/audit/workspace/${current.id}`).then(r => setLogs(r.data.logs)).catch(()=>{});
    api.get(`/audit/role/workspace/${current.id}`).then(r => setRole(r.data.role)).catch(()=>{});
  }, [current]);

  return (
    <div className="animate-fade-in mx-auto w-full max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Shield size={22}/> Security & Audit</h1>
          <p className="text-white/40 text-sm mt-1">RBAC + บันทึกการกระทำสำคัญ — {logs.length} รายการ</p>
        </div>
        {role && (
          <div className="flex items-center gap-2 rounded-xl border px-4 py-2"
            style={{ borderColor: (ROLE_COLOR[role] ?? "#6366f1") + "44", background: (ROLE_COLOR[role] ?? "#6366f1") + "11" }}>
            <ShieldCheck size={15} style={{ color: ROLE_COLOR[role] ?? "#6366f1" }} />
            <span className="text-sm font-semibold" style={{ color: ROLE_COLOR[role] ?? "#6366f1" }}>{role}</span>
          </div>
        )}
      </div>

      {/* RBAC info */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
        {[
          { r: "OWNER", d: "ทุกสิทธิ์ + ลบ workspace" },
          { r: "ADMIN", d: "จัดการ agent/tool/member" },
          { r: "MEMBER", d: "ใช้งาน + ลบ knowledge" },
          { r: "VIEWER", d: "ดูอย่างเดียว" },
        ].map(({ r, d }) => (
          <div key={r} className="rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md p-3">
            <span className="text-xs font-bold" style={{ color: ROLE_COLOR[r] }}>{r}</span>
            <p className="text-[11px] text-white/40 mt-1">{d}</p>
          </div>
        ))}
      </div>

      {/* Audit log */}
      <div className="rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md p-5">
        <p className="text-sm font-semibold text-white/70 mb-3">Audit Log</p>
        <div className="space-y-1">
          {logs.length === 0 && <p className="text-xs text-white/30">ยังไม่มีบันทึก — ลองรัน tool หรือลบเอกสาร</p>}
          {logs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#141228]/70 backdrop-blur-md px-3 py-2 text-xs">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[l.status] ?? "#6b7280" }} />
              <span className="font-mono text-white/80 w-32">{l.action}</span>
              <span className="text-white/50 flex-1 truncate">{l.actor ?? "—"}{l.target_id ? ` · ${l.target_type}:${l.target_id.slice(0,8)}` : ""}</span>
              <span className="text-white/25 w-20 text-right">{new Date(l.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
