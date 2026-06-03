import { create } from "zustand";
import api from "@/lib/api";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
  streaming?: boolean; // client-only flag during SSE
}

export interface Conversation {
  id: string;
  agent_id: string;
  workspace_id: string;
  title: string | null;
  status: string;
  created_at: string;
  messages: ChatMessage[];
}

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  sending: boolean;
  streamingContent: string; // accumulates SSE delta

  // Actions
  fetchConversations: (workspaceId: string) => Promise<void>;
  openOrCreate: (agentId: string, workspaceId: string) => Promise<string>;
  setActive: (id: string | null) => void;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  sendMessageStream: (conversationId: string, content: string) => Promise<void>;
  appendIncoming: (conversationId: string, message: ChatMessage) => void;
  getActive: () => Conversation | undefined;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  loading: false,
  sending: false,
  streamingContent: "",

  fetchConversations: async (workspaceId) => {
    set({ loading: true });
    try {
      const { data } = await api.get(`/conversations/workspace/${workspaceId}`);
      set({ conversations: data });
    } finally {
      set({ loading: false });
    }
  },

  openOrCreate: async (agentId, workspaceId) => {
    // Reuse existing open conversation with this agent
    const existing = get().conversations.find(
      (c) => c.agent_id === agentId && c.status === "active"
    );
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const { data } = await api.post("/conversations", { agent_id: agentId, workspace_id: workspaceId });
    set((s) => ({ conversations: [data, ...s.conversations], activeId: data.id }));
    return data.id as string;
  },

  setActive: (id) => set({ activeId: id }),

  sendMessage: async (conversationId, content) => {
    set({ sending: true });
    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      conversation_id: conversationId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, messages: [...c.messages, userMsg] } : c
      ),
    }));

    try {
      const { data } = await api.post(`/conversations/${conversationId}/messages`, { content });
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === conversationId ? { ...c, messages: [...c.messages, data] } : c
        ),
      }));
    } finally {
      set({ sending: false });
    }
  },

  sendMessageStream: async (conversationId, content) => {
    set({ sending: true, streamingContent: "" });

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      conversation_id: conversationId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    // Placeholder for assistant streaming message
    const streamPlaceholder: ChatMessage = {
      id: `stream-${Date.now()}`,
      conversation_id: conversationId,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      streaming: true,
    };
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, userMsg, streamPlaceholder] }
          : c
      ),
    }));

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/conversations/${conversationId}/messages/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
          body: JSON.stringify({ content }),
        }
      );

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.done) {
            // Replace placeholder with final message
            set((s) => ({
              conversations: s.conversations.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === streamPlaceholder.id
                          ? { ...m, content: accumulated, streaming: false, id: payload.message_id ?? m.id }
                          : m
                      ),
                    }
                  : c
              ),
              streamingContent: "",
            }));
          } else {
            accumulated += payload.delta;
            set((s) => ({
              streamingContent: accumulated,
              conversations: s.conversations.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === streamPlaceholder.id ? { ...m, content: accumulated } : m
                      ),
                    }
                  : c
              ),
            }));
          }
        }
      }
    } finally {
      set({ sending: false });
    }
  },

  appendIncoming: (conversationId, message) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, messages: [...c.messages, message] } : c
      ),
    }));
  },

  getActive: () => {
    const { conversations, activeId } = get();
    return conversations.find((c) => c.id === activeId);
  },
}));
