import { create } from "zustand";
import api from "@/lib/api";

interface ApiMessage {
  role: string;
  content: string;
  created_at: string;
}
interface ApiConversation {
  agent_id: string;
  messages: ApiMessage[];
}

interface OfficeChatsState {
  latestByAgent: Record<string, string>;
  /** Fetch conversations and keep the latest ASSISTANT line per agent. */
  fetchLatest: (workspaceId: string) => Promise<void>;
}

export const useOfficeChatsStore = create<OfficeChatsState>((set) => ({
  latestByAgent: {},

  fetchLatest: async (workspaceId) => {
    const { data } = await api.get<ApiConversation[]>(`/conversations/workspace/${workspaceId}`);

    // agent_id -> { content, time } of the newest assistant message seen
    const newest: Record<string, { content: string; time: number }> = {};
    for (const conv of data) {
      for (const m of conv.messages) {
        if (m.role !== "ASSISTANT") continue;
        const time = new Date(m.created_at).getTime();
        const prev = newest[conv.agent_id];
        if (!prev || time >= prev.time) {
          newest[conv.agent_id] = { content: m.content, time };
        }
      }
    }

    const latestByAgent: Record<string, string> = {};
    for (const [agentId, v] of Object.entries(newest)) latestByAgent[agentId] = v.content;
    set({ latestByAgent });
  },
}));
