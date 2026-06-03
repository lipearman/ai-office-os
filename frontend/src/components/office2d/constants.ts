export interface RoomConfig {
  id: string;
  type: string;
  label: string;
  emoji: string;
  color: string;       // floor color
  wallColor: string;
  gridCol: number;     // CSS grid column start
  gridRow: number;     // CSS grid row start
  colSpan: number;
  rowSpan: number;
}

export const ROOM_LAYOUT: RoomConfig[] = [
  // Row 1
  { id: "ceo",     type: "ceo",     label: "CEO Office",    emoji: "👔", color: "#1a1a2e", wallColor: "#f59e0b", gridCol: 1, gridRow: 1, colSpan: 2, rowSpan: 2 },
  { id: "meeting", type: "meeting", label: "Meeting Room",  emoji: "🤝", color: "#0d1b2a", wallColor: "#06b6d4", gridCol: 3, gridRow: 1, colSpan: 3, rowSpan: 2 },
  { id: "rag",     type: "rag",     label: "RAG Library",   emoji: "📚", color: "#1a0a2e", wallColor: "#ec4899", gridCol: 6, gridRow: 1, colSpan: 2, rowSpan: 2 },
  // Row 2
  { id: "ba",      type: "ba",      label: "BA Room",       emoji: "📊", color: "#0a1f0a", wallColor: "#10b981", gridCol: 1, gridRow: 3, colSpan: 2, rowSpan: 2 },
  { id: "dev",     type: "dev",     label: "Dev Room",      emoji: "💻", color: "#0a0a1f", wallColor: "#3b82f6", gridCol: 3, gridRow: 3, colSpan: 2, rowSpan: 2 },
  { id: "dba",     type: "dba",     label: "DBA Room",      emoji: "🗄️", color: "#1a0a1f", wallColor: "#8b5cf6", gridCol: 5, gridRow: 3, colSpan: 2, rowSpan: 2 },
  { id: "qa",      type: "qa",      label: "QA Room",       emoji: "🔍", color: "#1f0a0a", wallColor: "#ef4444", gridCol: 7, gridRow: 1, colSpan: 2, rowSpan: 4 },
  // Row 3 - Lobby (full width)
  { id: "lobby",   type: "lobby",   label: "Lobby",         emoji: "🚪", color: "#111827", wallColor: "#6366f1", gridCol: 1, gridRow: 5, colSpan: 8, rowSpan: 2 },
];

export const AGENT_COLORS: Record<string, string> = {
  reception: "#6366f1",
  ceo:       "#f59e0b",
  pm:        "#f59e0b",
  ba:        "#10b981",
  dev:       "#3b82f6",
  dba:       "#8b5cf6",
  qa:        "#ef4444",
  rag:       "#ec4899",
};

export const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖",
  ceo:       "👔",
  pm:        "👔",
  ba:        "📊",
  dev:       "💻",
  dba:       "🗄️",
  qa:        "🔍",
  rag:       "📚",
};

// Maps agent_type → room type
export const AGENT_ROOM_MAP: Record<string, string> = {
  reception: "lobby",
  ceo:       "ceo",
  pm:        "ceo",
  ba:        "ba",
  dev:       "dev",
  dba:       "dba",
  qa:        "qa",
  rag:       "rag",
};
