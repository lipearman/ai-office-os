import { create } from "zustand";

export interface FeedEntry {
  id: string;
  agentId: string;
  agentName: string;
  agentType: string;
  content: string;
  timestamp: number;
  isUser?: boolean;
}

interface LiveFeedState {
  entries: FeedEntry[];
  /** Push a new agent message (from bubble cycling) */
  pushAgentMessage: (agentId: string, agentName: string, agentType: string, content: string) => void;
  /** Push a user-sent message */
  pushUserMessage: (content: string, toAgentName: string) => void;
  /** Clear all entries (e.g. on template switch) */
  clear: () => void;
}

let _seq = 0;
const uid = () => `fe-${Date.now()}-${++_seq}`;

export const useOfficeLiveFeed = create<LiveFeedState>((set) => ({
  entries: [],

  pushAgentMessage: (agentId, agentName, agentType, content) =>
    set((s) => ({
      entries: [
        ...s.entries.slice(-150),
        { id: uid(), agentId, agentName, agentType, content, timestamp: Date.now() },
      ],
    })),

  pushUserMessage: (content, toAgentName) =>
    set((s) => ({
      entries: [
        ...s.entries.slice(-150),
        {
          id: uid(),
          agentId: "user",
          agentName: `@${toAgentName}`,
          agentType: "user",
          content,
          timestamp: Date.now(),
          isUser: true,
        },
      ],
    })),

  clear: () => set({ entries: [] }),
}));
