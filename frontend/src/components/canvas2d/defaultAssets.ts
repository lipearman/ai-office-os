import type { SpriteConfig, FurnitureItem } from "./types";

const A = "/assets";

// Each extracted character image holds 3 side-by-side poses → 3-frame, 1 row.
// frameW/frameH = 0 means "derive from the loaded image" (engine computes).
function charSprite(file: string): SpriteConfig {
  return { url: `${A}/characters/${file}`, frameW: 0, frameH: 0, cols: 3, rows: 1 };
}

// Map agent_type → extracted character sprite
export const DEFAULT_AGENT_SPRITES: Record<string, SpriteConfig> = {
  reception: charSprite("npc_female.png"),
  ceo:       charSprite("ceo_agent.png"),
  pm:        charSprite("pm_agent.png"),
  ba:        charSprite("ba_agent.png"),
  dev:       charSprite("dev_agent.png"),
  dba:       charSprite("dba_agent.png"),
  qa:        charSprite("qa_agent.png"),
  rag:       charSprite("rag_agent.png"),
};

export function defaultSpriteFor(agentType: string): SpriteConfig | null {
  return DEFAULT_AGENT_SPRITES[agentType] ?? null;
}

// Default furniture layout using extracted PNGs
export const DEFAULT_FURNITURE: FurnitureItem[] = [
  { id: "f1", label: "Desk",        imageUrl: `${A}/furniture/desk.png`,        x: 70,  y: 210, width: 120, height: 78,  emoji: "🖥️" },
  { id: "f2", label: "Desk",        imageUrl: `${A}/furniture/desk.png`,        x: 250, y: 210, width: 120, height: 78,  emoji: "🖥️" },
  { id: "f3", label: "Computer",    imageUrl: `${A}/furniture/computer.png`,    x: 95,  y: 195, width: 60,  height: 50,  emoji: "💻" },
  { id: "f4", label: "Sofa",        imageUrl: `${A}/furniture/sofa.png`,        x: 540, y: 170, width: 160, height: 90,  emoji: "🛋️" },
  { id: "f5", label: "Coffee Table",imageUrl: `${A}/furniture/coffee_table.png`,x: 600, y: 280, width: 90,  height: 60,  emoji: "☕" },
  { id: "f6", label: "Plant",       imageUrl: `${A}/furniture/plant.png`,       x: 780, y: 300, width: 70,  height: 100, emoji: "🌿" },
  { id: "f7", label: "Plant",       imageUrl: `${A}/furniture/plant.png`,       x: 30,  y: 120, width: 70,  height: 100, emoji: "🌿" },
  { id: "f8", label: "Bookshelf",   imageUrl: `${A}/furniture/bookshelf.png`,   x: 680, y: 50,  width: 150, height: 90,  emoji: "📚" },
  { id: "f9", label: "Vending",     imageUrl: `${A}/furniture/vending_machine.png`, x: 440, y: 50, width: 70, height: 110, emoji: "🥤" },
  { id: "f10",label: "Water",       imageUrl: `${A}/furniture/water_dispenser.png`, x: 520, y: 55, width: 60, height: 110, emoji: "💧" },
  { id: "f11",label: "Whiteboard",  imageUrl: `${A}/furniture/whiteboard.png`,  x: 300, y: 50,  width: 120, height: 80,  emoji: "📋" },
];

export const DEFAULT_BACKGROUND = `${A}/maps/office_full.png`;
