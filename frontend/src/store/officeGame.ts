import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FurnitureItem, SpriteConfig, OfficeGameConfig } from "@/components/canvas2d/types";
import { DEFAULT_FURNITURE, DEFAULT_BACKGROUND } from "@/components/canvas2d/defaultAssets";

export interface CatalogItem {
  id: string;
  name: string;
  url: string;
}

const FURN_NAMES = [
  "desk", "computer", "chair", "sofa", "coffee_table", "plant", "bookshelf",
  "cabinet", "locker", "vending_machine", "water_dispenser", "whiteboard",
  "notice_board", "box", "door", "stairs",
];
const DEFAULT_CATALOG: CatalogItem[] = FURN_NAMES.map((n) => ({
  id: `cat_${n}`, name: n, url: `/assets/furniture/${n}.png`,
}));

interface OfficeGameStore extends OfficeGameConfig {
  catalog: CatalogItem[];
  setBackground: (url: string | null, fit?: OfficeGameConfig["backgroundFit"]) => void;
  addFurniture: (item: FurnitureItem) => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  removeFurniture: (id: string) => void;
  setAgentSprite: (agentId: string, sprite: SpriteConfig | null) => void;
  addCatalogItem: (item: CatalogItem) => void;
  updateCatalogItem: (id: string, patch: Partial<CatalogItem>) => void;
  removeCatalogItem: (id: string) => void;
  resetCatalog: () => void;
  reset: () => void;
}

const isPersistable = (url: string | null | undefined) =>
  !!url && !url.startsWith("blob:");

export const useOfficeGameStore = create<OfficeGameStore>()(
  persist(
    (set) => ({
      backgroundUrl: DEFAULT_BACKGROUND,
      backgroundFit: "fill",
      furniture: DEFAULT_FURNITURE,
      agentSprites: {},
      catalog: DEFAULT_CATALOG,

      setBackground: (url, fit = "cover") => set({ backgroundUrl: url, backgroundFit: fit }),

      addFurniture: (item) => set((s) => ({ furniture: [...s.furniture, item] })),
      updateFurniture: (id, patch) =>
        set((s) => ({ furniture: s.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      removeFurniture: (id) =>
        set((s) => ({ furniture: s.furniture.filter((f) => f.id !== id) })),

      setAgentSprite: (agentId, sprite) =>
        set((s) => ({ agentSprites: { ...s.agentSprites, [agentId]: sprite } })),

      addCatalogItem: (item) => set((s) => ({ catalog: [...s.catalog, item] })),
      updateCatalogItem: (id, patch) =>
        set((s) => ({ catalog: s.catalog.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeCatalogItem: (id) =>
        set((s) => ({ catalog: s.catalog.filter((c) => c.id !== id) })),
      resetCatalog: () => set({ catalog: DEFAULT_CATALOG }),

      reset: () =>
        set({ backgroundUrl: DEFAULT_BACKGROUND, backgroundFit: "cover",
              furniture: DEFAULT_FURNITURE, agentSprites: {}, catalog: DEFAULT_CATALOG }),
    }),
    {
      name: "office-game-config-v7",
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
        catalog: s.catalog.filter((c) => isPersistable(c.url)),
      }),
    }
  )
);
