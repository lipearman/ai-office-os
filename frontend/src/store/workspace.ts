import { create } from "zustand";
import api from "@/lib/api";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
}

interface WorkspaceState {
  workspaces: Workspace[];
  current: Workspace | null;
  loading: boolean;
  fetch: () => Promise<void>;
  setCurrent: (w: Workspace) => void;
  create: (data: { name: string; slug: string; description?: string }) => Promise<Workspace>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  current: null,
  loading: false,

  fetch: async () => {
    set({ loading: true });
    const { data } = await api.get("/workspaces");
    set({ workspaces: data, loading: false });
    if (data.length > 0) set({ current: data[0] });
  },

  setCurrent: (w) => set({ current: w }),

  create: async (payload) => {
    const { data } = await api.post("/workspaces", payload);
    set((s) => ({ workspaces: [...s.workspaces, data], current: data }));
    return data;
  },
}));
