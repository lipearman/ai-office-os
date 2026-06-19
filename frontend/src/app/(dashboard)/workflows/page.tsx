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
import { Select } from "@/components/ui/select-dropdown";
import { Play, Save, Plus, Trash2, X } from "lucide-react";

const KIND_STYLE: Record<string, { bg: string; label: string; emoji: string }> = {
  start:     { bg: "#10b981", label: "Start", emoji: "▶️" },
  agent:     { bg: "#6366f1", label: "Agent", emoji: "🤖" },
  tool:      { bg: "#f59e0b", label: "Tool", emoji: "🔧" },
  condition: { bg: "#8b5cf6", label: "Condition", emoji: "🔀" },
  end:       { bg: "#ef4444", label: "End", emoji: "⏹️" },
};

const PIPELINE_STAGES = [
  { kind: "start",  x: 40,  y: 200, label: "▶️ Start" },
  { kind: "agent",  x: 200, y: 200, label: "📡 Monitor",  stage: "monitor" },
  { kind: "agent",  x: 360, y: 200, label: "📊 Analyst",  stage: "analyst" },
  { kind: "agent",  x: 520, y: 200, label: "📰 News",     stage: "news" },
  { kind: "agent",  x: 680, y: 200, label: "💹 Trader",   stage: "trader" },
  { kind: "agent",  x: 840, y: 200, label: "🛡️ Risk",     stage: "risk" },
  { kind: "agent",  x: 1000,y: 200, label: "⚡ Exec",     stage: "exec" },
  { kind: "agent",  x: 1160,y: 200, label: "🏋️ Coach",   stage: "coach" },
  { kind: "agent",  x: 1160,y: 80,  label: "📝 Summary",  stage: "summary" },
  { kind: "end",    x: 1340,y: 200, label: "⏹️ End" },
];

const PIPELINE_EDGES: Edge[] = [
  { id: "e-start-mon",   source: "n0", target: "n1", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e-mon-anal",    source: "n1", target: "n2", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e-anal-news",   source: "n2", target: "n3", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e-news-trad",   source: "n3", target: "n4", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e-trad-risk",   source: "n4", target: "n5", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e-risk-exec",   source: "n5", target: "n6", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e-exec-coach",  source: "n6", target: "n7", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e-coach-news",  source: "n7", target: "n3", animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeDasharray: "4 4", stroke: "#f59e0b" }, label: "loop" },
  { id: "e-coach-sum",   source: "n7", target: "n8", animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeDasharray: "4 4", stroke: "#10b981" }, label: "done" },
  { id: "e-sum-end",     source: "n8", target: "n9", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
];

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

function buildPipelineNodes(agentMap?: Record<string, { id: string; prompt: string }>): Node[] {
  return PIPELINE_STAGES.map((s, i) => {
    const kind = s.kind;
    const def = KIND_STYLE[kind] ?? KIND_STYLE.agent;
    const bg = (kind === "agent" && s.stage) ? "#6366f122" : def.bg + "22";
    const border = (kind === "agent" && s.stage) ? "2px solid #6366f1" : `2px solid ${def.bg}`;
    const agentInfo = (kind === "agent" && s.stage && agentMap?.[s.stage]) ? agentMap[s.stage] : null;
    return {
      id: `n${i}`,
      position: { x: s.x, y: s.y },
      data: { kind, label: s.label, stage: s.stage,
        ...(agentInfo ? { agent_id: agentInfo.id, prompt: agentInfo.prompt } : {}),
        ...(kind === "agent" ? { agent_type: s.stage } : {}) },
      style: { background: bg, border, color: "#fff", borderRadius: 10,
        padding: "8px 14px", fontSize: 12, fontWeight: 600, minWidth: 110 },
    };
  });
}

const TRADING_PIPELINE_NAME = "Trading Pipeline";
const KEEP_WF_NAMES = new Set(["Feature Spec Pipeline", "Bug Triage", TRADING_PIPELINE_NAME]);

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
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);

  const isPipeline = name === TRADING_PIPELINE_NAME;

  const openWorkflow = useCallback(async (id: string) => {
    const { data } = await api.get(`/workflows/${id}`);
    setActiveId(id); setName(data.name); setPipelineStatus(null);
    const ns = (data.nodes || []).map((n: any, i: number) => {
      const kind = n.data?.kind ?? n.type ?? "agent";
      const s = KIND_STYLE[kind] ?? KIND_STYLE.agent;
      return {
        id: n.id ?? `n${i}`,
        position: n.position && typeof n.position.x === "number"
          ? n.position : { x: 80 + i * 180, y: 160 },
        data: { kind, label: n.data?.label ?? `${s.emoji} ${s.label}`, ...(n.data ?? {}) },
        style: n.style ?? {
          background: s.bg + "22", border: `2px solid ${s.bg}`, color: "#fff",
          borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 600, minWidth: 110,
        },
      };
    });
    setNodes(ns); setEdges(data.edges || []);
    setSelected(null); setRunResult(null);
  }, []);

  const loadList = useCallback(() => {
    if (!current) return;
    api.get(`/workflows/workspace/${current.id}`).then(async (r) => {
      let items = r.data.workflows || [];
      // Clean up duplicates: remove E2E WF and empty New Workflow
      for (const w of items) {
        if (KEEP_WF_NAMES.has(w.name)) continue;
        if (w.name === "E2E WF" || (w.name === "New Workflow" && (!w.nodes || w.nodes.length === 0))) {
          try { await api.delete(`/workflows/${w.id}`); } catch {}
        }
      }
      items = items.filter((w: any) => !(w.name === "E2E WF" || (w.name === "New Workflow" && (!w.nodes || w.nodes.length === 0))));
      // Auto-create Trading Pipeline if missing, or patch if nodes have no agent_id
      const agentsRes = await api.get(`/agents/workspace/${current.id}`);
      const agentList: any[] = agentsRes.data || [];
      const agentMap: Record<string, { id: string; prompt: string }> = {};
      for (const a of agentList) {
        if (a.agent_type) agentMap[a.agent_type] = { id: a.id, prompt: a.system_prompt || "" };
      }
      const tp = items.find((w: any) => w.name === TRADING_PIPELINE_NAME);
      if (!tp) {
        try {
          const payload = { workspace_id: current.id, name: TRADING_PIPELINE_NAME,
            nodes: buildPipelineNodes(agentMap), edges: PIPELINE_EDGES };
          const { data: created } = await api.post(`/workflows`, payload);
          items.push(created);
        } catch {}
      } else {
        // patch existing pipeline if any agent node is missing agent_id
        const needsPatch = (tp.nodes || []).some((n: any) => n.data?.stage && !n.data?.agent_id);
        if (needsPatch) {
          const patchedNodes = buildPipelineNodes(agentMap);
          try { await api.patch(`/workflows/${tp.id}`, { nodes: patchedNodes, edges: PIPELINE_EDGES }); } catch {}
        }
      }
      setList(items);
      // Auto-open Trading Pipeline
      if (tp) openWorkflow(tp.id);
    }).catch(() => {});
  }, [current, openWorkflow]);

  useEffect(() => { loadList(); }, [loadList]);
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
    setEdges([]); setSelected(null); setRunResult(null); setPipelineStatus(null);
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
    if (!current) return;
    if (isPipeline) {
      // Call trading pipeline trigger
      setRunning(true); setRunResult(null); setPipelineStatus("starting...");
      try {
        const { data } = await api.post(`/desk/pipeline/trigger?workspace_id=${current.id}`);
        setPipelineStatus("running");
        setRunResult({ status: "accepted", message: "Pipeline triggered in background", details: data });
      } catch (e: any) {
        setPipelineStatus("error");
        setRunResult({ status: "error", message: e?.message || "Failed to trigger" });
      } finally { setRunning(false); }
      return;
    }
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
    <div className="absolute inset-0 flex">
      {/* Left: workflow list */}
      <div className="w-56 shrink-0 border-r border-white/8 bg-[#16131f] flex flex-col">
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
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-4 py-2.5 bg-[#16131f]/90 border-b border-white/8">
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="bg-transparent text-sm font-bold text-white outline-none flex-1" />
          {pipelineStatus && (
            <span className={`text-xs font-mono ${pipelineStatus === "running" ? "text-green-400" : pipelineStatus === "error" ? "text-red-400" : "text-yellow-400"}`}>
              ● {pipelineStatus}
            </span>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={save}><Save size={13}/> Save</Button>
          <Button size="sm" className="gap-1.5" loading={running} onClick={run}>
            <Play size={13}/> Run
          </Button>
        </div>
        <div className="absolute inset-0 pt-12">
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n)}
            fitView proOptions={{ hideAttribution: true }}
            style={{ background: "#0e0b16" }}
          >
            <Background color="#1f2937" gap={20} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Run result */}
        {runResult && (
          <div className="absolute bottom-4 left-4 right-4 max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/80 p-3 backdrop-blur-xl z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white">
                {isPipeline ? "Pipeline" : "Run"}: <span className={runResult.status === "accepted" || runResult.status === "success" ? "text-green-400" : "text-red-400"}>{runResult.status}</span>
              </span>
              <button onClick={() => setRunResult(null)} className="text-white/40"><X size={14}/></button>
            </div>
            <pre className="text-[11px] text-green-300 whitespace-pre-wrap">{JSON.stringify(runResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Right: node inspector (read-only for pipeline) */}
      {selected && (
        <div className="w-64 shrink-0 border-l border-white/8 bg-[#16131f] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-white">{selected.data.label}</span>
            <button onClick={() => setSelected(null)} className="text-white/40"><X size={15}/></button>
          </div>

          {selected.data.kind === "agent" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/50">Agent</label>
                <Select value={selected.data.agent_id ?? ""}
                  options={agents.map((a: any) => ({ value: a.id, label: `${a.name} (${a.agent_type})` }))}
                  onChange={(v) => updateSelected({ agent_id: v })} placeholder="— เลือก —" />
              </div>
              <div>
                <label className="text-xs text-white/50">Prompt (ว่าง = ใช้ output ก่อนหน้า)</label>
                <textarea value={selected.data.prompt ?? ""} onChange={(e) => updateSelected({ prompt: e.target.value })}
                  rows={3} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white resize-none" />
              </div>
            </div>
          )}

          {selected.data.kind === "tool" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/50">Tool</label>
                <Select value={selected.data.tool_name ?? ""}
                  options={tools.map((t: any) => ({ value: t.name, label: `${t.icon || ""} ${t.label || t.name}` }))}
                  onChange={(v) => updateSelected({ tool_name: v })} placeholder="— เลือก —" />
              </div>
              <div>
                <label className="text-xs text-white/50">Params (JSON)</label>
                <textarea value={selected.data.paramsText ?? ""} onChange={(e) => {
                  let params: any = {}; try { params = JSON.parse(e.target.value); } catch {}
                  updateSelected({ paramsText: e.target.value, params });
                }} rows={3} placeholder='{"expression":"2+2"}'
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white font-mono resize-none" />
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
