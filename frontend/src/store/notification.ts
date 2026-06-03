import { create } from "zustand";

export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  level: NotificationLevel;
  message: string;
  title?: string;
  duration?: number; // ms, 0 = persistent
}

interface NotificationState {
  items: Notification[];
  push: (n: Omit<Notification, "id">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 0;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],

  push: (n) => {
    const id = `notif-${++seq}`;
    set((s) => ({ items: [...s.items, { ...n, id }] }));

    const duration = n.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration);
    }
    return id;
  },

  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clear: () => set({ items: [] }),
}));
