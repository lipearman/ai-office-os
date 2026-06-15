"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Bot, Plus, X, Save } from "lucide-react";

const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊", dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
};
const AGENT_COLORS: Record<string, string> = {
  reception: "#6366f1", ceo: "#f59e0b", pm: "#f59e0b", ba: "#10b981",
  dev: "#3b82f6", dba: "#8b5cf6", qa: "#ef4444", rag: "#ec4899",
};
const TYPES = ["reception", "ceo", "pm", "ba", "dev", "dba", "qa", "rag"];

export default function AgentsPage() {
  const { current } = useWorkspaceStore();
  const [agents, setAgents] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [llmOpts, setLlmOpts] = useState<{ providers: string[]; models: Record<string, string[]> }>({ providers: ["auto"], models: {} });

  const load = () => { if (current) api.get(`/agents/workspace/${current.id}`).then(r => setAgents(r.data)).catch(()=>{}); };
  useEffect(() => { load(); }, [current]);
  useEffect(() => { api.get(`/agents/llm/options`).then(r => setLlmOpts(r.data)).catch(()=>{}); }, []);

  const save = async () => {
    if (!current || !editing) return;
    if (editing.id) {
      await api.patch(`/agents/${editing.id}`, {
        name: editing.name, description: editing.description, system_prompt: editing.system_prompt,
        model_provider: editing.model_provider, model_name: editing.model_name,
      });
    } else {
      await api.post(`/agents/workspace/${current.id}`, {
        name: editing.name, agent_type: editing.agent_type, description: editing.description,
        system_prompt: editing.system_prompt || `You are ${editing.name}.`,
        model_provider: editing.model_provider || "auto", model_name: editing.model_name || "auto",
      });
    }
    setEditing(null); load();
  };

  return (
    <div className="animate-fade-in mx-auto w-full max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Bot size={22}/> Agents</h1>
          <p className="text-white/40 text-sm mt-1">จัดการ AI agents — {agents.length} ตัว</p>
        </div>
        <Button onClick={() => setEditing({ agent_type: "dev", model_provider: "auto", model_name: "auto" })} className="gap-1.5">
          <Plus size={14}/> สร้าง Agent
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {agents.map((a) => (
          <button key={a.id} onClick={() => setEditing({ ...a })}
            className="flex items-start gap-3 rounded-xl border border-white/8 bg-[#141228]/70 backdrop-blur-md p-4 text-left hover:border-white/20">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
              style={{ background: (AGENT_COLORS[a.agent_type] ?? "#6366f1") + "22", border: `1px solid ${AGENT_COLORS[a.agent_type] ?? "#6366f1"}` }}>
              {AGENT_EMOJI[a.agent_type] ?? "🤖"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{a.name}</p>
              <p className="text-xs text-white/40 capitalize">{a.agent_type} · {a.model_name}</p>
              <p className="text-xs text-white/30 mt-1 line-clamp-2">{a.description || a.system_prompt}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Editor modal */}
      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#16131f] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white">{editing.id ? "แก้ไข Agent" : "สร้าง Agent"}</h2>
              <button onClick={() => setEditing(null)} className="text-white/40 hover:text-white"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <Field label="ชื่อ"><input value={editing.name ?? ""} onChange={(e)=>setEditing({...editing,name:e.target.value})} className={inp}/></Field>
              {!editing.id && (
                <Field label="ประเภท">
                  <select value={editing.agent_type} onChange={(e)=>setEditing({...editing,agent_type:e.target.value})} className={inp}>
                    {TYPES.map(t => <option key={t} value={t}>{AGENT_EMOJI[t]} {t}</option>)}
                  </select>
                </Field>
              )}
              <Field label="คำอธิบาย"><input value={editing.description ?? ""} onChange={(e)=>setEditing({...editing,description:e.target.value})} className={inp}/></Field>
              <Field label="System Prompt"><textarea rows={5} value={editing.system_prompt ?? ""} onChange={(e)=>setEditing({...editing,system_prompt:e.target.value})} className={`${inp} resize-none`}/></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Provider">
                  <select value={editing.model_provider ?? "auto"} onChange={(e)=>setEditing({...editing,model_provider:e.target.value})} className={inp}>
                    {llmOpts.providers.map((p)=><option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Model">
                  <input list="agent-models" value={editing.model_name ?? ""} onChange={(e)=>setEditing({...editing,model_name:e.target.value})} placeholder="auto" className={inp}/>
                  <datalist id="agent-models">
                    <option value="auto" />
                    {(llmOpts.models[editing.model_provider] ?? []).map((m)=><option key={m} value={m} />)}
                  </datalist>
                </Field>
              </div>
            </div>
            <Button onClick={save} className="w-full mt-5 gap-1.5"><Save size={14}/> บันทึก</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-white/50 mb-1 block">{label}</label>{children}</div>;
}
