"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X, Settings2 } from "lucide-react";

const WORKER_DEFS: Record<string, { emoji: string; color: string; label: string; role: string }> = {
  trader:  { emoji: "📈", color: "#22d3ee", label: "TRADER",  role: "engine" },
  analyst: { emoji: "📊", color: "#a78bfa", label: "ANALYST", role: "advisory" },
  news:    { emoji: "📰", color: "#f59e0b", label: "NEWS",    role: "advisory" },
  risk:    { emoji: "🛡️", color: "#ef4444", label: "RISK",    role: "advisory" },
  coach:   { emoji: "🎯", color: "#10b981", label: "COACH",   role: "advisory" },
  monitor: { emoji: "📡", color: "#6366f1", label: "MONITOR", role: "advisory" },
  exec:    { emoji: "✅", color: "#ec4899", label: "EXEC",    role: "advisory" },
  summary: { emoji: "📝", color: "#34d399", label: "SUMMARY", role: "advisory" },
};

const ALL_TOOLS = [
  "signal_scanner", "market_analysis", "news_sentiment", "risk_assessment",
  "backtest_engine", "ml_forecast", "paper_trading", "portfolio_tracker",
];

const inpCls = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white";

export default function AgentsPage() {
  const { current } = useWorkspaceStore();
  const [agents, setAgents] = useState<any[]>([]);
  const [llmOpts, setLlmOpts] = useState<{ providers: string[]; models: Record<string, string[]> }>({ providers: ["auto"], models: {} });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const knownTypes = new Set(Object.keys(WORKER_DEFS));

  const load = useCallback(() => {
    if (!current) return;
    api.get(`/agents/workspace/${current.id}`).then(async (r) => {
      let all = (r.data || []).filter((a: any) => knownTypes.has(a.agent_type));
      // deduplicate by agent_type (keep first)
      const seen = new Set<string>();
      all = all.filter((a: any) => { if (seen.has(a.agent_type)) return false; seen.add(a.agent_type); return true; });
      const existing = all;
      const existingTypes = seen;
      // auto-create missing agents (e.g. Summary)
      for (const key of Object.keys(WORKER_DEFS)) {
        if (existingTypes.has(key)) continue;
        const def = WORKER_DEFS[key];
        try {
          const { data: created } = await api.post(`/agents/workspace/${current.id}`, {
            name: def.label.charAt(0) + def.label.slice(1).toLowerCase(),
            agent_type: key,
            system_prompt: "",
            config: { emoji: def.emoji, color: def.color, role: def.role },
          });
          existing.push(created);
        } catch {}
      }
      // patch agents with empty system_prompt → backend fills default
      await Promise.all(existing.map(async (a: any) => {
        if (!a.system_prompt) {
          try { const { data: updated } = await api.patch(`/agents/${a.id}`, { system_prompt: "" }); Object.assign(a, updated); } catch {}
        }
      }));
      setAgents(existing);
    }).catch(() => {});
  }, [current]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get(`/agents/llm/options`).then(r => setLlmOpts(r.data)).catch(() => {}); }, []);

  const updateField = useCallback((agentId: string, field: string, value: any) => {
    setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, [field]: value } : a)));
  }, []);

  const save = useCallback(async (agent: any) => {
    setSaving(agent.id);
    try {
      await api.patch(`/agents/${agent.id}`, {
        description: agent.description,
        system_prompt: agent.system_prompt,
        model_provider: agent.model_provider,
        model_name: agent.model_name,
        config: agent.config || {},
        tools: agent.tools || [],
      });
      setEditId(null);
    } catch {}
    setSaving(null);
  }, []);

  const toggleTool = useCallback((agent: any, tool: string) => {
    const tools: string[] = agent.tools || [];
    const next = tools.includes(tool) ? tools.filter((t: string) => t !== tool) : [...tools, tool];
    updateField(agent.id, "tools", next);
  }, [updateField]);

  const updCfg = useCallback((agentId: string, key: string, val: any) => {
    setAgents((prev) => prev.map((a) =>
      a.id === agentId ? { ...a, config: { ...(a.config || {}), [key]: val } } : a
    ));
  }, []);

  return (
    <div className="animate-fade-in mx-auto w-full max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Settings2 size={22} /> Desk Snapshot</h1>
          <p className="text-white/40 text-sm mt-1">{Object.keys(WORKER_DEFS).length} trading desk agents — {agents.length} ตัว</p>
        </div>
      </div>

      <div className="space-y-3">
        {agents.map((agent) => {
          const def = WORKER_DEFS[agent.agent_type];
          const cfg = agent.config || {};
          const emoji = cfg.emoji || def?.emoji || "🤖";
          const color = cfg.color || def?.color || "#6366f1";
          const role = cfg.role || def?.role || "advisory";
          return (
            <button key={agent.id} type="button" onClick={() => setEditId(agent.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-[#141228]/70 backdrop-blur-md p-4 text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
                style={{ background: color + "22", border: `1px solid ${color}` }}>
                {emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white">{agent.name}</p>
                  <span className="rounded bg-white/10 px-1.5 py-px text-[10px] font-semibold text-white/60">
                    {def?.label || agent.agent_type}
                  </span>
                  <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${
                    role === "engine" ? "bg-cyan-500/15 text-cyan-300" : "bg-amber-500/15 text-amber-300"
                  }`}>{role}</span>
                </div>
                <p className="text-xs text-white/40 mt-0.5">{agent.model_provider} · {agent.model_name}</p>
              </div>
              <span className={`rounded-full px-2 py-px text-[10px] font-semibold ${
                agent.status === "BUSY" ? "bg-amber-500/20 text-amber-300" :
                agent.status === "IDLE" ? "bg-emerald-500/20 text-emerald-300" :
                "bg-white/10 text-white/40"
              }`}>{agent.status}</span>
              <Settings2 size={14} className="text-white/30 shrink-0" />
            </button>
          );
        })}
      </div>

      {/* edit popup */}
      {editId && (() => {
        const agent = agents.find((a) => a.id === editId);
        if (!agent) return null;
        const def = WORKER_DEFS[agent.agent_type];
        const cfg = agent.config || {};
        const tools: string[] = agent.tools || [];
        const color = cfg.color || def?.color || "#6366f1";
        const role = cfg.role || def?.role || "advisory";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setEditId(null)}>
            <div onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#141228] p-6 shadow-2xl">
              <button type="button" onClick={() => setEditId(null)}
                className="absolute right-4 top-4 rounded-full p-1 text-white/40 hover:bg-white/5 hover:text-white transition-colors">
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-full text-xl"
                  style={{ background: color + "22", border: `1px solid ${color}` }}>
                  {cfg.emoji || def?.emoji || "🤖"}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{agent.name}</p>
                  <p className="text-xs text-white/40">{def?.label || agent.agent_type} · {role}</p>
                </div>
              </div>

              <div className="space-y-4">
                <Field label="Description">
                  <input value={agent.description ?? ""}
                    onChange={(e) => updateField(agent.id, "description", e.target.value)}
                    className={inpCls} placeholder="Agent description" />
                </Field>

                <Field label="System Prompt">
                  <textarea rows={4} value={agent.system_prompt ?? ""}
                    onChange={(e) => updateField(agent.id, "system_prompt", e.target.value)}
                    className={`${inpCls} resize-none`} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="LLM Provider">
                    <Select value={agent.model_provider ?? "auto"}
                      options={llmOpts.providers}
                      onChange={(v) => updateField(agent.id, "model_provider", v)} />
                  </Field>
                  <Field label="Model">
                    <input list="agent-models" value={agent.model_name ?? ""}
                      onChange={(e) => updateField(agent.id, "model_name", e.target.value)}
                      placeholder="auto" className={inpCls} />
                    <datalist id="agent-models">
                      {(llmOpts.models[agent.model_provider] ?? []).map((m: string) => <option key={m} value={m} />)}
                    </datalist>
                  </Field>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Emoji">
                    <input value={cfg.emoji ?? ""} placeholder={def?.emoji || "🤖"}
                      onChange={(e) => updCfg(agent.id, "emoji", e.target.value)}
                      className={inpCls} />
                  </Field>
                  <Field label="Color">
                    <input value={cfg.color ?? ""} placeholder={def?.color || "#6366f1"}
                      onChange={(e) => updCfg(agent.id, "color", e.target.value)}
                      className={inpCls} />
                  </Field>
                  <Field label="Role">
                    <Select value={cfg.role ?? def?.role ?? "advisory"}
                      options={["engine", "advisory"]}
                      onChange={(v) => updCfg(agent.id, "role", v)} />
                  </Field>
                </div>

                <Field label="Temperature">
                  <div className="flex items-center gap-3">
                    <input type="range" min="0" max="2" step="0.05"
                      value={cfg.temperature ?? 0.3}
                      onChange={(e) => updCfg(agent.id, "temperature", parseFloat(e.target.value))}
                      className="flex-1 accent-indigo-400" />
                    <span className="w-10 text-right text-xs text-white/60 tabular-nums">
                      {cfg.temperature ?? 0.3}
                    </span>
                  </div>
                </Field>

                <Field label="Tools">
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_TOOLS.map((tool) => {
                      const enabled = tools.includes(tool);
                      return (
                        <button key={tool} type="button"
                          onClick={() => toggleTool(agent, tool)}
                          className={`rounded px-2 py-1 text-[10px] font-medium border transition-colors ${
                            enabled
                              ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-300"
                              : "border-white/10 text-white/40 hover:border-white/30"
                          }`}
                        >{tool}</button>
                      );
                    })}
                  </div>
                </Field>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id={`mem-${agent.id}`}
                    checked={cfg.memory_enabled ?? false}
                    onChange={() => updCfg(agent.id, "memory_enabled", !(cfg.memory_enabled ?? false))}
                    className="rounded border-white/20 bg-white/5" />
                  <label htmlFor={`mem-${agent.id}`} className="text-xs text-white/60 select-none">Memory enabled</label>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setEditId(null)}
                    className="border-white/10 text-white/60 hover:text-white">Cancel</Button>
                  <Button size="sm" onClick={() => save(agent)} disabled={saving === agent.id}
                    className="gap-1.5">
                    {saving === agent.id
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Save size={14} />}
                    Save Config
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen(!open)}
      className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-[#1e1b2e] px-3 py-2 text-sm text-white">
      {value}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-white/40 transition-transform ${open ? "rotate-90" : ""}`}><path d="M9 18l6-6-6-6"/></svg>
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#1e1b2e] shadow-xl">
      {options.map((o) => (
        <button key={o} type="button" onMouseDown={() => { onChange(o); setOpen(false); }}
          className={`block w-full px-3 py-1.5 text-left text-sm transition-colors ${o === value ? "bg-indigo-500/20 text-indigo-300" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
        >{o}</button>
      ))}
    </div>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-white/50 mb-1 block">{label}</label>{children}</div>;
}
