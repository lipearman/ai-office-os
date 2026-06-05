"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Users, Play, Sparkles } from "lucide-react";

const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊", dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
};
const AGENT_COLORS: Record<string, string> = {
  reception: "#6366f1", ceo: "#f59e0b", pm: "#f59e0b", ba: "#10b981",
  dev: "#3b82f6", dba: "#8b5cf6", qa: "#ef4444", rag: "#ec4899",
};

export default function MeetingPage() {
  const { current } = useWorkspaceStore();
  const [agents, setAgents] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState(2);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!current) return;
    api.get(`/agents/workspace/${current.id}`).then(r => {
      setAgents(r.data);
      setSelected(new Set(r.data.slice(0, 4).map((a: any) => a.id)));
    }).catch(()=>{});
  }, [current]);

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const run = async () => {
    if (!current || !topic.trim() || selected.size === 0) return;
    setRunning(true); setResult(null);
    try {
      const { data } = await api.post("/meetings/run", {
        workspace_id: current.id, topic, agent_ids: [...selected], rounds,
      });
      setResult(data);
    } finally { setRunning(false); }
  };

  return (
    <div className="animate-fade-in max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Users size={22}/> AI Meeting</h1>
        <p className="text-white/40 text-sm mt-1">ให้ทีม agent ประชุมหารือหัวข้อร่วมกัน แล้วสรุปผล</p>
      </div>

      {/* Setup */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-4 mb-6 space-y-4">
        <input value={topic} onChange={(e) => setTopic(e.target.value)}
          placeholder="หัวข้อประชุม เช่น: ออกแบบฟีเจอร์ login ใหม่ ต้องคำนึงถึงอะไรบ้าง?"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white" />

        <div>
          <p className="text-xs text-white/50 mb-2">เลือกผู้เข้าร่วม ({selected.size})</p>
          <div className="flex flex-wrap gap-2">
            {agents.map((a) => {
              const on = selected.has(a.id);
              const c = AGENT_COLORS[a.agent_type] ?? "#6366f1";
              return (
                <button key={a.id} onClick={() => toggle(a.id)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
                  style={{ background: on ? c + "33" : "rgba(255,255,255,0.04)",
                           border: `1px solid ${on ? c : "rgba(255,255,255,0.1)"}`,
                           color: on ? "#fff" : "rgba(255,255,255,0.5)" }}>
                  {AGENT_EMOJI[a.agent_type] ?? "🤖"} {a.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50">รอบ:</span>
          {[1,2,3].map((r) => (
            <button key={r} onClick={() => setRounds(r)}
              className={`px-3 py-1 rounded-lg text-xs ${rounds===r ? "bg-primary-600 text-white" : "bg-white/5 text-white/50"}`}>{r}</button>
          ))}
          <Button loading={running} onClick={run} className="ml-auto gap-1.5"><Play size={14}/> เริ่มประชุม</Button>
        </div>
      </div>

      {running && (
        <div className="text-center py-8 text-sm text-white/50 animate-pulse">🗣️ agents กำลังประชุม...</div>
      )}

      {/* Transcript */}
      {result && (
        <div className="space-y-4">
          <div className="space-y-3">
            {result.transcript.map((t: any, i: number) => {
              const c = AGENT_COLORS[t.agent_type] ?? "#6366f1";
              return (
                <div key={i} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                    style={{ background: c + "22", border: `1px solid ${c}` }}>
                    {AGENT_EMOJI[t.agent_type] ?? "🤖"}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold mb-0.5" style={{ color: c }}>{t.agent}</p>
                    <div className="rounded-xl rounded-tl-sm bg-white/5 px-3 py-2 text-sm text-white/80">{t.content}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {result.summary && (
            <div className="rounded-xl border border-primary-500/30 bg-primary-600/10 p-4">
              <p className="flex items-center gap-1.5 text-sm font-bold text-primary-300 mb-2"><Sparkles size={14}/> สรุปการประชุม</p>
              <p className="text-sm text-white/80 whitespace-pre-wrap">{result.summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
