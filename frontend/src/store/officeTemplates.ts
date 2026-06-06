import { create } from "zustand";
import api from "@/lib/api";

export interface Marker {
  id: string;
  agent_id: string;
  x: number; // 0-100 (% of image width)
  y: number; // 0-100 (% of image height)
  scale: number;
}

export interface OfficeTemplate {
  id: string;
  workspace_id: string;
  name: string;
  image_url: string | null;
  markers: Marker[];
  is_active: boolean;
  created_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Backend uploads return relative `/static/...` URLs served from the API host. */
export function resolveAssetUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (url.startsWith("/static") || url.startsWith("/uploads")) return `${API_URL}${url}`;
  return url;
}

interface TemplatesState {
  templates: OfficeTemplate[];
  loading: boolean;
  saving: boolean;
  activeTemplate: OfficeTemplate | null;

  fetchTemplates: (workspaceId: string) => Promise<void>;
  createTemplate: (workspaceId: string, name: string) => Promise<OfficeTemplate>;
  updateTemplate: (id: string, patch: Partial<Omit<OfficeTemplate, "id" | "workspace_id" | "created_at">>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
}

function computeActive(templates: OfficeTemplate[]): OfficeTemplate | null {
  return templates.find((t) => t.is_active) ?? templates[0] ?? null;
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],
  loading: false,
  saving: false,
  activeTemplate: null,

  fetchTemplates: async (workspaceId) => {
    set({ loading: true });
    try {
      const { data } = await api.get<OfficeTemplate[]>(`/offices/templates/workspace/${workspaceId}`);
      set({ templates: data, activeTemplate: computeActive(data) });
    } finally {
      set({ loading: false });
    }
  },

  createTemplate: async (workspaceId, name) => {
    set({ saving: true });
    try {
      const isFirst = get().templates.length === 0;
      const { data } = await api.post<OfficeTemplate>(
        `/offices/templates/workspace/${workspaceId}`,
        { name, markers: [], is_active: isFirst }
      );
      const templates = [...get().templates, data];
      set({ templates, activeTemplate: computeActive(templates) });
      return data;
    } finally {
      set({ saving: false });
    }
  },

  updateTemplate: async (id, patch) => {
    set({ saving: true });
    try {
      const { data } = await api.patch<OfficeTemplate>(`/offices/templates/${id}`, patch);
      const templates = get().templates.map((t) => (t.id === id ? data : t));
      set({ templates, activeTemplate: computeActive(templates) });
    } finally {
      set({ saving: false });
    }
  },

  deleteTemplate: async (id) => {
    await api.delete(`/offices/templates/${id}`);
    const templates = get().templates.filter((t) => t.id !== id);
    set({ templates, activeTemplate: computeActive(templates) });
  },

  activate: async (id) => {
    await api.patch(`/offices/templates/${id}`, { is_active: true });
    const templates = get().templates.map((t) => ({ ...t, is_active: t.id === id }));
    set({ templates, activeTemplate: computeActive(templates) });
  },
}));
