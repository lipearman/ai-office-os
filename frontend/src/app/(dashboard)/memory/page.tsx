"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Brain, Plus, Trash2, Search } from "lucide-react";

interface Mem { id: string; kind: string; content: string; importance: number; created_at: string; }

const KIND_COLOR: Record<string, string> = {
  fact: "#6366f1", preference: "#ec4899", summary: "#10b981", exchange: "#f59e0b",
};

export default function MemoryPage() {
  const { current } = useWorkspaceStore();
  const [mems, setMems] = useState<Mem[]>([]);
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);

  const load = () => { if (current) api.get(`/memories/workspace/${current.id}`).then(r => setMems(r.data.memories)).catch(() => {}); };
  useEffect(() => { load(); }, [current]);

  const add = async () => {
    if (!current || !content.trim()) return;
    setAdding(true);
    try {
      await api.post("/memories", { workspace_id: current.id, content, kind: "fact", importance: 1.5 });
      setContent(""); load();
    } finally { setAdding(false); }
  };

  const del = async (id: string) => { await api.delete(`/memories/${id}`); load(); };

  const search = async () => {
    if (!current || !query.trim()) return;
    const { data } = await api.post("/memories/recall", { workspace_id: current.id, query, top_k: 5 });
    setHits(data.results);
  };

  return (
    <div className="animate-fade-in mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Brain size={22}/> Memory</h1>
        <p className="text-white/40 text-sm mt-1">ความจำระยะยาวของ agent — {mems.length} รายการ (inject เข้าแชทอัตโนมัติ)</p>
      </div>

      {/* Add */}
      <div className="mb-5 flex gap-2">
        <input value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="เพิ่ม fact / preference ที่อยากให้ agent จำ..."
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
        <Button loading={adding} onClick={add} className="gap-1.5"><Plus size={14}/> เพิ่ม</Button>
      </div>

      {/* Recall test */}
      <div className="mb-6 rounded-xl border border-white/8 bg-[#141228]/70 backdrop-blur-md p-4">
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="ทดสอบ recall — พิมพ์คำถามดูว่า agent จะนึกถึง memory ไหน"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
          <Button onClick={search} variant="outline" className="gap-1.5"><Search size={14}/> Recall</Button>
        </div>
        {hits.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {hits.map((h, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-600/30 text-primary-300">{(h.score*100).toFixed(0)}%</span>
                <span className="text-xs text-white/70">{h.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="space-y-1.5">
        {mems.map((m) => (
          <div key={m.id} className="flex items-start gap-3 rounded-xl border border-white/8 bg-[#141228]/70 backdrop-blur-md p-3">
            <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 mt-0.5"
              style={{ background: (KIND_COLOR[m.kind] ?? "#6366f1") + "22", color: KIND_COLOR[m.kind] ?? "#6366f1" }}>
              {m.kind}
            </span>
            <p className="text-sm text-white/70 flex-1 whitespace-pre-wrap">{m.content}</p>
            <button onClick={() => del(m.id)} className="text-white/30 hover:text-red-400 shrink-0"><Trash2 size={15}/></button>
          </div>
        ))}
        {mems.length === 0 && <p className="text-xs text-white/30 text-center py-8">ยังไม่มี memory — แชทกับ agent หรือเพิ่มเอง</p>}
      </div>
    </div>
  );
}
