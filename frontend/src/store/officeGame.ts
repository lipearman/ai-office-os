import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FurnitureItem, SpriteConfig, OfficeGameConfig } from "@/components/canvas2d/types";
import { DEFAULT_FURNITURE, DEFAULT_BACKGROUND } from "@/components/canvas2d/defaultAssets";

interface OfficeGameStore extends OfficeGameConfig {
  setBackground: (url: string | null, fit?: OfficeGameConfig["backgroundFit"]) => void;
  addFurniture: (item: FurnitureItem) => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  removeFurniture: (id: string) => void;
  setAgentSprite: (agentId: string, sprite: SpriteConfig | null) => void;
  reset: () => void;
}

const isPersistable = (url: string | null | undefined) =>
  !!url && !url.startsWith("blob:");

export const useOfficeGameStore = create<OfficeGameStore>()(
  persist(
    (set) => ({
      backgroundUrl: DEFAULT_BACKGROUND,
      backgroundFit: "cover",
      furniture: DEFAULT_FURNITURE,
      agentSprites: {},

      setBackground: (url, fit = "cover") => set({ backgroundUrl: url, backgroundFit: fit }),

      addFurniture: (item) => set((s) => ({ furniture: [...s.furniture, item] })),

      updateFurniture: (id, patch) =>
        set((s) => ({ furniture: s.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),

      removeFurniture: (id) =>
        set((s) => ({ furniture: s.furniture.filter((f) => f.id !== id) })),

      setAgentSprite: (agentId, sprite) =>
        set((s) => ({ agentSprites: { ...s.agentSprites, [agentId]: sprite } })),

      reset: () =>
        set({ backgroundUrl: DEFAULT_BACKGROUND, backgroundFit: "cover", furniture: DEFAULT_FURNITURE, agentSprites: {} }),
    }),
    {
      name: "office-game-config-v5",
      partialize: (s) => ({
        backgroundFit: s.backgroundFit,
        backgroundUrl: isPersistable(s.backgroundUrl) ? s.backgroundUrl : DEFAULT_BACKGROUND,
        furniture: s.furniture.map((f) => ({
          ...f,
          imageUrl: isPersistable(f.imageUrl) ? f.imageUrl : null,
        })),
        agentSprites: Object.fromEntries(
          Object.entries(s.agentSprites).filter(([, sp]) => isPersistable(sp?.url))
        ),
      }),
    }
  )
);
