export type Direction = "down" | "left" | "right" | "up";

export interface SpriteConfig {
  url: string;           // spritesheet URL (blob or /sprites/...)
  frameW: number;        // width of one frame in pixels
  frameH: number;        // height of one frame in pixels
  cols: number;          // frames per row
  // Row order: 0=down, 1=left, 2=right, 3=up (standard RPG)
  // if single image (not spritesheet): cols=1, frameW=imgW, frameH=imgH
}

export interface AgentGameState {
  id: string;
  name: string;
  agentType: string;
  status: string;
  sprite: SpriteConfig | null;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  direction: Direction;
  walkFrame: number;
  frameTimer: number;
  walking: boolean;
  color: string;         // fallback color when no sprite
}

export interface FurnitureItem {
  id: string;
  label: string;
  imageUrl: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  emoji: string;
}

export interface OfficeGameConfig {
  backgroundUrl: string | null;
  backgroundFit: "cover" | "contain" | "fill" | "tile";
  furniture: FurnitureItem[];
  agentSprites: Record<string, SpriteConfig | null>; // agentId → sprite
}
