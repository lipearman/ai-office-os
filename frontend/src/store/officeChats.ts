import { create } from "zustand";
import api from "@/lib/api";

const THIRTY_MIN_MS = 30 * 60 * 1000;

interface ApiMessage {
  role: string;
  content: string;
  created_at: string;
}
interface ApiConversation {
  agent_id: string;
  status: string;
  messages: ApiMessage[];
}

interface OfficeChatsState {
  /** Latest ASSISTANT message content per agent */
  latestByAgent: Record<string, string>;
  /** All ASSISTANT messages per agent, sorted oldest→newest */
  allMessagesByAgent: Record<string, string[]>;
  /** Timestamp (ms) of the latest ASSISTANT message per agent */
  lastMsgTimeByAgent: Record<string, number>;
  /** Conversation status per agent ("ACTIVE" / "ARCHIVED" …) */
  convStatusByAgent: Record<string, string>;

  fetchLatest: (workspaceId: string) => Promise<void>;

  /**
   * Returns true when the agent's conversation should still show a message bubble:
   *  - last ASSISTANT reply was within 30 minutes, OR
   *  - the conversation is still ACTIVE (job running)
   */
  isActiveConversation: (agentId: string) => boolean;
}

export const useOfficeChatsStore = create<OfficeChatsState>((set, get) => ({
  latestByAgent: {},
  allMessagesByAgent: {},
  lastMsgTimeByAgent: {},
  convStatusByAgent: {},

  fetchLatest: async (workspaceId) => {
    const { data } = await api.get<ApiConversation[]>(
      `/conversations/workspace/${workspaceId}`
    );

    const latestByAgent: Record<string, string> = {};
    const lastMsgTimeByAgent: Record<string, number> = {};
    const convStatusByAgent: Record<string, string> = {};
    // collect all assistant messages per agent with timestamps for sorting
    const rawMsgs: Record<string, { content: string; time: number }[]> = {};

    for (const conv of data) {
      const agentId = conv.agent_id;
      if (!rawMsgs[agentId]) rawMsgs[agentId] = [];

      for (const m of conv.messages) {
        if (m.role !== "ASSISTANT") continue;
        const time = new Date(m.created_at).getTime();
        rawMsgs[agentId].push({ content: m.content, time });

        // track latest per agent
        const prev = lastMsgTimeByAgent[agentId] ?? 0;
        if (time >= prev) {
          latestByAgent[agentId] = m.content;
          lastMsgTimeByAgent[agentId] = time;
          convStatusByAgent[agentId] = conv.status.toUpperCase();
        }
      }
    }

    // sort oldest→newest so cycling plays in chronological order
    const allMessagesByAgent: Record<string, string[]> = {};
    for (const [agentId, msgs] of Object.entries(rawMsgs)) {
      allMessagesByAgent[agentId] = msgs
        .sort((a, b) => a.time - b.time)
        .map((m) => m.content);
    }

    set({ latestByAgent, allMessagesByAgent, lastMsgTimeByAgent, convStatusByAgent });
  },

  isActiveConversation: (agentId) => {
    const { lastMsgTimeByAgent, convStatusByAgent, latestByAgent } = get();
    if (!latestByAgent[agentId]) return false;
    const lastTime = lastMsgTimeByAgent[agentId] ?? 0;
    const isRecent = Date.now() - lastTime < THIRTY_MIN_MS;
    const isConvActive = convStatusByAgent[agentId] === "ACTIVE";
    return isRecent || isConvActive;
  },
}));
