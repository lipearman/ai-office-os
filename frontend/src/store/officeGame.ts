import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FurnitureItem, SpriteConfig, OfficeGameConfig } from "@/components/canvas2d/types";

interface OfficeGameStore extends OfficeGameConfig {
  // Background
  setBackground: (url: string | null, fit?: OfficeGameConfig["backgroundFit"]) => void;

  // Furniture
  addFurniture: (item: FurnitureItem) => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  removeFurniture: (id: string) => void;

  // Agent sprites
  setAgentSprite: (agentId: string, sprite: SpriteConfig | null) => void;

  // Reset
  reset: () => void;
}

const DEFAULT_FURNITURE: FurnitureItem[] = [
  { id: "f1", label: "Desk",       imageUrl: null, x: 80,  y: 200, width: 140, height: 70,  emoji: "🖥️" },
  { id: "f2", label: "Desk",       imageUrl: null, x: 280, y: 200, width: 140, height: 70,  emoji: "🖥️" },
  { id: "f3", label: "Desk",       imageUrl: null, x: 80,  y: 340, width: 140, height: 70,  emoji: "💻" },
  { id: "f4", label: "Couch",      imageUrl: null, x: 520, y: 160, width: 200, height: 90,  emoji: "🛋️" },
  { id: "f5", label: "Plant",      imageUrl: null, x: 780, y: 300, width: 60,  height: 90,  emoji: "🌿" },
  { id: "f6", label: "Plant",      imageUrl: null, x: 40,  y: 120, width: 60,  height: 90,  emoji: "🌿" },
  { id: "f7", label: "Bookshelf",  imageUrl: null, x: 680, y: 60,  width: 160, height: 80,  emoji: "📚" },
  { id: "f8", label: "Vending",    imageUrl: null, x: 460, y: 60,  width: 60,  height: 130, emoji: "🥤" },
];

export const useOfficeGameStore = create<OfficeGameStore>()(
  persist(
    (set) => ({
      backgroundUrl: null,
      backgroundFit: "cover",
      furniture: DEFAULT_FURNITURE,
      agentSprites: {},

      setBackground: (url, fit = "cover") => set({ backgroundUrl: url, backgroundFit: fit }),

      addFurniture: (item) =>
        set((s) => ({ furniture: [...s.furniture, item] })),

      updateFurniture: (id, patch) =>
        set((s) => ({
          furniture: s.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),

      removeFurniture: (id) =>
        set((s) => ({ furniture: s.furniture.filter((f) => f.id !== id) })),

      setAgentSprite: (agentId, sprite) =>
        set((s) => ({ agentSprites: { ...s.agentSprites, [agentId]: sprite } })),

      reset: () =>
        set({ backgroundUrl: null, backgroundFit: "cover", furniture: DEFAULT_FURNITURE, agentSprites: {} }),
    }),
    {
      name: "office-game-config",
      // Don't persist blob URLs (they don't survive page reload)
      partialize: (s) => ({
        backgroundFit: s.backgroundFit,
        furniture: s.furniture.map((f) => ({
          ...f,
          imageUrl: f.imageUrl?.startsWith("blob:") ? null : f.imageUrl,
        })),
      }),
    }
  )
);
