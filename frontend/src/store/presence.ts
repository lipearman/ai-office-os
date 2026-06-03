import { create } from "zustand";

interface PresenceState {
  onlineUsers: Set<string>;
  typingUsers: Map<string, string>; // userId -> conversationId
  setOnline: (users: string[]) => void;
  addUser: (userId: string) => void;
  removeUser: (userId: string) => void;
  setTyping: (userId: string, conversationId: string) => void;
  clearTyping: (userId: string) => void;
  isOnline: (userId: string) => boolean;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUsers: new Set(),
  typingUsers: new Map(),

  setOnline: (users) => set({ onlineUsers: new Set(users) }),

  addUser: (userId) =>
    set((s) => ({ onlineUsers: new Set([...s.onlineUsers, userId]) })),

  removeUser: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    }),

  setTyping: (userId, conversationId) =>
    set((s) => {
      const next = new Map(s.typingUsers);
      next.set(userId, conversationId);
      return { typingUsers: next };
    }),

  clearTyping: (userId) =>
    set((s) => {
      const next = new Map(s.typingUsers);
      next.delete(userId);
      return { typingUsers: next };
    }),

  isOnline: (userId) => get().onlineUsers.has(userId),
}));
