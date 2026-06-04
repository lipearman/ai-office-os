"use client";

import { useCallback, useEffect, useState } from "react";
import ReactFlow, {
  Background, Controls, addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection, MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Play, Save, Plus, Trash2, X } from "lucide-react";

const KIND_STYLE: Record<string, { bg: string; label: string; emoji: string }> = {
  start:     { bg: "#10b981", label: "Start", emoji: "▶️" },
  agent:     { bg: "#6366f1", label: "Agent", emoji: "🤖" },
  tool:      { bg: "#f59e0b", label: "Tool", emoji: "🔧" },
  condition: { bg: "#8b5cf6", label: "Condition", emoji: "🔀" },
  end:       { bg: "#ef4444", label: "End", emoji: "⏹️" },
};

let idc = 1;
const nid = () => `n${Date.now()}_${idc++}`;

function styledNode(kind: string, x: number, y: number, data: any = {}): Node {
  const s = KIND_STYLE[kind];
  return {
    id: nid(), position: { x, y },
    data: { kind, label: `${s.emoji} ${s.label}`, ...data },
    style: {
      background: s.bg + "22", border: `2px solid ${s.bg}`, color: "#fff",
      borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 600, minWidth: 110,
    },
  };
}

export default function WorkflowsPage() {
  const { current } = useWorkspaceStore();
  const [list, setList] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("New Workflow");
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<Node | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [runResult, setRunResult] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const loadList = () => current && api.get(`/workflows/workspace/${current.id}`).then(r => setList(r.data.workflows));
  useEffect(() => { loadList(); }, [current]);
  useEffect(() => {
    if (!current) return;
    api.get(`/agents/workspace/${current.id}`).then(r => setAgents(r.data)).catch(()=>{});
    api.get(`/tools`).then(r => setTools(r.data.tools)).catch(()=>{});
  }, [current]);

  const onConnect = useCallback((c: Connection) =>
    setEdges((eds) => addEdge({ ...c, markerEnd: { type: MarkerType.ArrowClosed }, animated: true }, eds)),
    [setEdges]);

  const addNode = (kind: string) => {
    setNodes((n) => [...n, styledNode(kind, 120 + Math.random() * 240, 80 + Math.random() * 240)]);
  };

  const newWorkflow = () => {
    setActiveId(null); setName("New Workflow");
    setNodes([styledNode("start", 80, 160), styledNode("end", 520, 160)]);
    setEdges([]); setSelected(null); setRunResult(null);
  };

  const openWorkflow = async (id: string) => {
    const { data } = await api.get(`/workflows/${id}`);
    setActiveId(id); setName(data.name);
    setNodes(data.nodes || []); setEdges(data.edges || []);
    setSelected(null); setRunResult(null);
  };

  const save = async () => {
    if (!current) return;
    const payload = { name, nodes, edges };
    if (activeId) await api.patch(`/workflows/${activeId}`, payload);
    else {
      const { data } = await api.post(`/workflows`, { workspace_id: current.id, ...payload });
      setActiveId(data.id);
    }
    loadList();
  };

  const run = async () => {
    if (!activeId) { await save(); }
    if (!activeId && !current) return;
    setRunning(true); setRunResult(null);
    try {
      const id = activeId ?? (list[0]?.id);
      const { data } = await api.post(`/workflows/${id}/run`, { input: { text: "Hello" } });
      setRunResult(data);
    } finally { setRunning(false); }
  };

  const updateSelected = (patch: any) => {
    if (!selected) return;
    setNodes((ns) => ns.map((n) => n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n));
    setSelected((s) => s ? { ...s, data: { ...s.data, ...patch } } : s);
  };

  const deleteSelected = () => {
    if (!selected) return;
    setNodes((ns) => ns.filter((n) => n.id !== selected.id));
    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id));
    setSelected(null);
  };

  return (
    <div className="-m-6 h-screen flex">
      {/* Left: workflow list + palette */}
      <div className="w-56 shrink-0 border-r border-white/8 bg-[#0d0d1f] flex flex-col">
        <div className="p-3 border-b border-white/8">
          <Button size="sm" className="w-full gap-1.5" onClick={newWorkflow}><Plus size={14}/> New</Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {list.map((w) => (
            <button key={w.id} onClick={() => openWorkflow(w.id)}
              className={`w-full text-left rounded-lg px-3 py-2 text-xs ${activeId === w.id ? "bg-primary-600/20 text-primary-300" : "text-white/60 hover:bg-white/5"}`}>
              {w.name}
            </button>
          ))}
          {list.length === 0 && <p className="text-xs text-white/30 p-2">ยังไม่มี workflow</p>}
        </div>
        <div className="p-3 border-t border-white/8">
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">เพิ่ม Node</p>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(KIND_STYLE).map(([k, s]) => (
              <button key={k} onClick={() => addNode(k)}
                className="rounded-lg px-2 py-1.5 text-xs text-white"
                style={{ background: s.bg + "22", border: `1px solid ${s.bg}55` }}>
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Center: canvas */}
      <div className="flex-1 relative">
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-4 py-2.5 bg-[#0d0d1f]/90 border-b border-white/8">
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="bg-transparent text-sm font-bold text-white outline-none flex-1" />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={save}><Save size={13}/> Save</Button>
          <Button size="sm" className="gap-1.5" loading={running} onClick={run}><Play size={13}/> Run</Button>
        </div>
        <div className="absolute inset-0 pt-12">
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onNodeClick={(_, n) => setSelected(n)}
            fitView proOptions={{ hideAttribution: true }}
            style={{ background: "#0a0a1a" }}
          >
            <Background color="#1f2937" gap={20} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Run result */}
        {runResult && (
          <div className="absolute bottom-4 left-4 right-4 max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/80 p-3 backdrop-blur-xl z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white">Run: <span className={runResult.status === "success" ? "text-green-400" : "text-red-400"}>{runResult.status}</span></span>
              <button onClick={() => setRunResult(null)} className="text-white/40"><X size={14}/></button>
            </div>
            <pre className="text-[11px] text-green-300 whitespace-pre-wrap">{JSON.stringify(runResult.steps, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Right: node inspector */}
      {selected && (
        <div className="w-64 shrink-0 border-l border-white/8 bg-[#0d0d1f] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-white">{selected.data.label}</span>
            <button onClick={() => setSelected(null)} className="text-white/40"><X size={15}/></button>
          </div>

          {selected.data.kind === "agent" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/50">Agent</label>
                <select value={selected.data.agent_id ?? ""} onChange={(e) => updateSelected({ agent_id: e.target.value })}
                  className="w-full mt-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white">
                  <option value="">— เลือก —</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.agent_type})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/50">Prompt (ว่าง = ใช้ output ก่อนหน้า)</label>
                <textarea value={selected.data.prompt ?? ""} onChange={(e) => updateSelected({ prompt: e.target.value })}
                  rows={3} className="w-full mt-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white resize-none" />
              </div>
            </div>
          )}

          {selected.data.kind === "tool" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/50">Tool</label>
                <select value={selected.data.tool_name ?? ""} onChange={(e) => updateSelected({ tool_name: e.target.value })}
                  className="w-full mt-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white">
                  <option value="">— เลือก —</option>
                  {tools.map((t) => <option key={t.name} value={t.name}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/50">Params (JSON)</label>
                <textarea value={selected.data.paramsText ?? ""} onChange={(e) => {
                  let params: any = {}; try { params = JSON.parse(e.target.value); } catch {}
                  updateSelected({ paramsText: e.target.value, params });
                }} rows={3} placeholder='{"expression":"2+2"}'
                  className="w-full mt-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white font-mono resize-none" />
              </div>
            </div>
          )}

          {(selected.data.kind === "start" || selected.data.kind === "end" || selected.data.kind === "condition") && (
            <p className="text-xs text-white/40">node นี้ไม่มีการตั้งค่า</p>
          )}

          <button onClick={deleteSelected}
            className="mt-4 flex items-center justify-center gap-1.5 w-full rounded-lg bg-red-500/15 border border-red-500/30 py-2 text-xs text-red-400 hover:bg-red-500/25">
            <Trash2 size={13}/> ลบ node
          </button>
        </div>
      )}
    </div>
  );
}
