"use client";

import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Trash2, Search, Plus } from "lucide-react";

interface Doc { id: string; title: string; source: string; chunk_count: number; created_at: string; }
interface Hit { score: number; content: string; document_title: string; chunk_index: number; }

export default function KnowledgePage() {
  const { current } = useWorkspaceStore();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = () => {
    if (!current) return;
    api.get(`/knowledge/documents/workspace/${current.id}`).then((r) => setDocs(r.data.documents)).catch(() => {});
  };
  useEffect(loadDocs, [current]);

  const addText = async () => {
    if (!current || !title || !text) return;
    setUploading(true);
    try {
      await api.post("/knowledge/documents", { workspace_id: current.id, title, content: text, source: "text" });
      setTitle(""); setText(""); setShowAdd(false); loadDocs();
    } finally { setUploading(false); }
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("workspace_id", current.id);
      form.append("file", file);
      await api.post("/knowledge/documents/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      loadDocs();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const del = async (id: string) => {
    await api.delete(`/knowledge/documents/${id}`);
    loadDocs();
  };

  const search = async () => {
    if (!current || !query.trim()) return;
    setSearching(true);
    try {
      const { data } = await api.post("/knowledge/search", { workspace_id: current.id, query, top_k: 5 });
      setHits(data.results);
    } finally { setSearching(false); }
  };

  return (
    <div className="animate-fade-in max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📚 Knowledge Hub</h1>
          <p className="text-white/40 text-sm mt-1">อัปโหลดเอกสาร + ค้นหาแบบ semantic — {docs.length} docs</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <Button size="md" variant="outline" loading={uploading} className="gap-1.5 pointer-events-none">
              <Upload size={14} /> Upload PDF/TXT
            </Button>
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md" className="hidden" onChange={uploadFile} />
          </label>
          <Button size="md" onClick={() => setShowAdd((s) => !s)} className="gap-1.5">
            <Plus size={14} /> Add Text
          </Button>
        </div>
      </div>

      {/* Add text form */}
      {showAdd && (
        <div className="mb-6 rounded-xl border border-white/8 bg-white/3 p-4 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อเอกสาร"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="เนื้อหา..." rows={5}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white resize-none" />
          <Button size="sm" loading={uploading} onClick={addText}>บันทึก + Index</Button>
        </div>
      )}

      {/* Search */}
      <div className="mb-6 rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="ค้นหาในเอกสาร (semantic search)..."
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
          <Button loading={searching} onClick={search} className="gap-1.5"><Search size={14} /> Search</Button>
        </div>
        {hits.length > 0 && (
          <div className="mt-4 space-y-2">
            {hits.map((h, i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-black/30 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-600/30 text-primary-300">
                    {(h.score * 100).toFixed(0)}%
                  </span>
                  <span className="text-xs font-medium text-white/70">{h.document_title}</span>
                  <span className="text-[10px] text-white/30">chunk #{h.chunk_index}</span>
                </div>
                <p className="text-xs text-white/60 line-clamp-3">{h.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Doc list */}
      <div className="grid gap-2 sm:grid-cols-2">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-3">
            <FileText size={18} className="text-primary-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{d.title}</p>
              <p className="text-xs text-white/40">{d.source} · {d.chunk_count} chunks</p>
            </div>
            <button onClick={() => del(d.id)} className="text-white/30 hover:text-red-400"><Trash2 size={15} /></button>
          </div>
        ))}
        {docs.length === 0 && <p className="text-xs text-white/30 col-span-2 text-center py-8">ยังไม่มีเอกสาร — อัปโหลดหรือเพิ่ม text</p>}
      </div>
    </div>
  );
}
