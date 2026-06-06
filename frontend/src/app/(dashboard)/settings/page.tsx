"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Save, KeyRound } from "lucide-react";

export default function SettingsPage() {
  const { current, fetch } = useWorkspaceStore();
  const { user } = useAuthStore();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (current) { setName(current.name); setDesc(current.description ?? ""); }
  }, [current]);

  const save = async () => {
    if (!current) return;
    await api.patch(`/workspaces/${current.id}`, { name, description: desc });
    await fetch();
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="animate-fade-in mx-auto w-full max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><SettingsIcon size={22}/> Settings</h1>
        <p className="text-white/40 text-sm mt-1">ตั้งค่า workspace + บัญชี</p>
      </div>

      {/* Workspace */}
      <div className="rounded-xl border border-white/8 bg-[#141228]/70 backdrop-blur-md p-5 mb-5 space-y-4">
        <p className="text-sm font-semibold text-white/70">Workspace</p>
        <div>
          <label className="text-xs text-white/50 mb-1 block">ชื่อ</label>
          <input value={name} onChange={(e)=>setName(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1 block">คำอธิบาย</label>
          <textarea rows={3} value={desc} onChange={(e)=>setDesc(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white resize-none" />
        </div>
        <div className="text-xs text-white/30">slug: {current?.slug} · id: {current?.id?.slice(0,8)}…</div>
        <Button onClick={save} className="gap-1.5">{saved ? "✓ บันทึกแล้ว" : <><Save size={14}/> บันทึก</>}</Button>
      </div>

      {/* Account */}
      <div className="rounded-xl border border-white/8 bg-[#141228]/70 backdrop-blur-md p-5 mb-5">
        <p className="text-sm font-semibold text-white/70 mb-3">บัญชี</p>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600/30 text-lg font-semibold text-primary-200">
            {user?.full_name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-white">{user?.full_name}</p>
            <p className="text-xs text-white/40">{user?.email} · {user?.role}</p>
          </div>
        </div>
      </div>

      {/* LLM keys info */}
      <div className="rounded-xl border border-white/8 bg-[#141228]/70 backdrop-blur-md p-5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white/70 mb-2"><KeyRound size={14}/> LLM Providers</p>
        <p className="text-xs text-white/40 leading-relaxed">
          API keys ตั้งค่าฝั่ง server ที่ไฟล์ <code className="text-primary-300">backend/.env</code> เพื่อความปลอดภัย
          (OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, OLLAMA_BASE_URL) —
          ถ้าไม่ตั้ง agent จะใช้ fallback response
        </p>
      </div>
    </div>
  );
}
