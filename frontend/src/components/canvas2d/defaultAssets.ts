import type { SpriteConfig, FurnitureItem } from "./types";

const A = "/assets";

// 4-direction walk sheets: N frames (cols) x 4 directions (rows),
// row order down/left/right/up. frameW/H = 0 → derived from the image.
function walkSprite(file: string, cols = 2): SpriteConfig {
  return { url: `${A}/characters/${file}`, frameW: 0, frameH: 0, cols, rows: 4 };
}

// Map agent_type → walking character sprite
export const DEFAULT_AGENT_SPRITES: Record<string, SpriteConfig> = {
  reception: walkSprite("walk_girl_headphone.png"),
  ceo:       walkSprite("walk_boy_blonde.png"),
  pm:        walkSprite("walk_boy_cap.png"),
  ba:        walkSprite("walk_girl_pink.png"),
  dev:       walkSprite("walk_boy_brown.png"),
  dba:       walkSprite("walk_girl_purple.png"),
  qa:        walkSprite("walk_girl_brown.png"),
  rag:       walkSprite("walk_dragon.png", 3),   // RPG-Maker 3-frame sheet
};

export function defaultSpriteFor(agentType: string): SpriteConfig | null {
  return DEFAULT_AGENT_SPRITES[agentType] ?? null;
}

// Default furniture layout — empty for now (add via the editor)
export const DEFAULT_FURNITURE: FurnitureItem[] = [];

export const DEFAULT_BACKGROUND = `${A}/maps/office_floor.png`;
