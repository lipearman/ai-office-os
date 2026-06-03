import { create } from "zustand";
import api from "@/lib/api";

export interface Room {
  id: string;
  name: string;
  room_type: string;
  description: string | null;
  position_x: number;
  position_y: number;
  position_z: number;
  width: number;
  depth: number;
  config: { color?: string; emoji?: string; [key: string]: unknown };
  is_active: boolean;
}

export interface OfficeData {
  id: string;
  name: string;
  theme: string;
  rooms: Room[];
}

export interface AgentData {
  id: string;
  name: string;
  agent_type: string;
  room_id: string | null;
  status: "idle" | "busy" | "offline" | "error";
  avatar_url: string | null;
  position_x: number;
  position_y: number;
  position_z: number;
}

interface OfficeState {
  office: OfficeData | null;
  agents: AgentData[];
  selectedRoom: Room | null;
  selectedAgent: AgentData | null;
  cameraTarget: [number, number, number];
  loading: boolean;

  fetchOffice: (workspaceId: string) => Promise<void>;
  fetchAgents: (workspaceId: string) => Promise<void>;
  selectRoom: (room: Room | null) => void;
  selectAgent: (agent: AgentData | null) => void;
  setCameraTarget: (target: [number, number, number]) => void;
}

export const useOfficeStore = create<OfficeState>((set, get) => ({
  office: null,
  agents: [],
  selectedRoom: null,
  selectedAgent: null,
  cameraTarget: [0, 0, 0],
  loading: false,

  fetchOffice: async (workspaceId) => {
    set({ loading: true });
    try {
      const { data } = await api.get(`/offices/workspace/${workspaceId}`);
      if (data.length > 0) {
        set({ office: data[0] });
      } else {
        // Auto-create default office
        const { data: created } = await api.post(`/offices/workspace/${workspaceId}`, {
          name: "Main Office",
          theme: "default",
        });
        set({ office: created });
      }
    } finally {
      set({ loading: false });
    }
  },

  fetchAgents: async (workspaceId) => {
    const { data } = await api.get(`/agents/workspace/${workspaceId}`);
    set({ agents: data });
  },

  selectRoom: (room) => {
    set({ selectedRoom: room, selectedAgent: null });
    if (room) {
      set({ cameraTarget: [room.position_x, 0, room.position_z] });
    }
  },

  selectAgent: (agent) => set({ selectedAgent: agent }),

  setCameraTarget: (target) => set({ cameraTarget: target }),
}));
