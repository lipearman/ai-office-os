export interface FurnitureInstance {
  id: string;         // unique instance id
  defId: string;      // furniture type
  col: number;        // grid column
  row: number;        // grid row
  flipX?: boolean;
}

export interface RoomDef {
  id: string;
  label: string;
  emoji: string;
  col: number;        // top-left grid col
  row: number;        // top-left grid row
  cols: number;       // width in grid cells
  rows: number;       // height in grid cells
  floorColor: number; // hex color
  wallColor: number;
  accentColor: string; // CSS string for labels
  furniture: FurnitureInstance[];
}

export const DEFAULT_LAYOUT: RoomDef[] = [
  {
    id: "ceo", label: "CEO Office", emoji: "👔",
    col: 0, row: 0, cols: 8, rows: 6,
    floorColor: 0x8B4513, wallColor: 0xF59E0B, accentColor: "#F59E0B",
    furniture: [
      { id: "f1", defId: "desk_corner",   col: 1, row: 1 },
      { id: "f2", defId: "chair",         col: 2, row: 2 },
      { id: "f3", defId: "computer",      col: 1, row: 1 },
      { id: "f4", defId: "bookshelf",     col: 5, row: 1 },
      { id: "f5", defId: "plant_big",     col: 6, row: 4 },
      { id: "f6", defId: "couch_2",       col: 4, row: 3 },
      { id: "f7", defId: "coffee_table",  col: 4, row: 4 },
      { id: "f8", defId: "armchair",      col: 3, row: 4 },
      { id: "f9", defId: "plant_small",   col: 0, row: 5 },
    ],
  },
  {
    id: "meeting", label: "Meeting Room", emoji: "🤝",
    col: 8, row: 0, cols: 8, rows: 6,
    floorColor: 0x1E3A5F, wallColor: 0x06B6D4, accentColor: "#06B6D4",
    furniture: [
      { id: "m1", defId: "meeting_table", col: 1, row: 1 },
      { id: "m2", defId: "chair",         col: 1, row: 0 },
      { id: "m3", defId: "chair",         col: 2, row: 0 },
      { id: "m4", defId: "chair",         col: 3, row: 0 },
      { id: "m5", defId: "chair",         col: 4, row: 0 },
      { id: "m6", defId: "chair",         col: 1, row: 3 },
      { id: "m7", defId: "chair",         col: 2, row: 3 },
      { id: "m8", defId: "chair",         col: 3, row: 3 },
      { id: "m9", defId: "whiteboard",    col: 6, row: 1 },
      { id: "m10",defId: "plant_small",   col: 7, row: 5 },
    ],
  },
  {
    id: "dev", label: "Dev Room", emoji: "💻",
    col: 16, row: 0, cols: 8, rows: 6,
    floorColor: 0x0A0A2E, wallColor: 0x3B82F6, accentColor: "#3B82F6",
    furniture: [
      { id: "d1", defId: "desk_single",   col: 1, row: 1 },
      { id: "d2", defId: "desk_single",   col: 1, row: 3 },
      { id: "d3", defId: "desk_single",   col: 4, row: 1 },
      { id: "d4", defId: "desk_single",   col: 4, row: 3 },
      { id: "d5", defId: "computer",      col: 1, row: 1 },
      { id: "d6", defId: "computer",      col: 1, row: 3 },
      { id: "d7", defId: "computer",      col: 4, row: 1 },
      { id: "d8", defId: "computer",      col: 4, row: 3 },
      { id: "d9", defId: "server",        col: 6, row: 1 },
      { id: "d10",defId: "monitor_big",   col: 6, row: 3 },
      { id: "d11",defId: "plant_small",   col: 7, row: 5 },
    ],
  },
  {
    id: "ba", label: "BA Room", emoji: "📊",
    col: 0, row: 6, cols: 8, rows: 6,
    floorColor: 0x0A1F0A, wallColor: 0x10B981, accentColor: "#10B981",
    furniture: [
      { id: "b1", defId: "desk_double",   col: 1, row: 1 },
      { id: "b2", defId: "desk_single",   col: 5, row: 1 },
      { id: "b3", defId: "computer",      col: 1, row: 1 },
      { id: "b4", defId: "computer",      col: 5, row: 1 },
      { id: "b5", defId: "whiteboard",    col: 3, row: 4 },
      { id: "b6", defId: "bookshelf",     col: 6, row: 3 },
      { id: "b7", defId: "plant_big",     col: 0, row: 0 },
    ],
  },
  {
    id: "dba", label: "DBA Room", emoji: "🗄️",
    col: 8, row: 6, cols: 8, rows: 6,
    floorColor: 0x1A0A2E, wallColor: 0x8B5CF6, accentColor: "#8B5CF6",
    furniture: [
      { id: "db1", defId: "desk_single",  col: 1, row: 1 },
      { id: "db2", defId: "desk_single",  col: 4, row: 2 },
      { id: "db3", defId: "server",       col: 6, row: 0 },
      { id: "db4", defId: "server",       col: 7, row: 0 },
      { id: "db5", defId: "computer",     col: 1, row: 1 },
      { id: "db6", defId: "cabinet",      col: 6, row: 3 },
      { id: "db7", defId: "plant_small",  col: 0, row: 5 },
    ],
  },
  {
    id: "qa", label: "QA Room", emoji: "🔍",
    col: 16, row: 6, cols: 8, rows: 6,
    floorColor: 0x1F0A0A, wallColor: 0xEF4444, accentColor: "#EF4444",
    furniture: [
      { id: "q1", defId: "desk_single",   col: 1, row: 1 },
      { id: "q2", defId: "desk_single",   col: 1, row: 3 },
      { id: "q3", defId: "desk_single",   col: 4, row: 1 },
      { id: "q4", defId: "computer",      col: 1, row: 1 },
      { id: "q5", defId: "computer",      col: 1, row: 3 },
      { id: "q6", defId: "computer",      col: 4, row: 1 },
      { id: "q7", defId: "whiteboard",    col: 5, row: 3 },
      { id: "q8", defId: "plant_small",   col: 7, row: 5 },
    ],
  },
  {
    id: "rag", label: "RAG Library", emoji: "📚",
    col: 0, row: 12, cols: 8, rows: 6,
    floorColor: 0x1A0A2E, wallColor: 0xEC4899, accentColor: "#EC4899",
    furniture: [
      { id: "r1", defId: "bookshelf",     col: 0, row: 0 },
      { id: "r2", defId: "bookshelf",     col: 2, row: 0 },
      { id: "r3", defId: "bookshelf",     col: 0, row: 2 },
      { id: "r4", defId: "desk_single",   col: 4, row: 2 },
      { id: "r5", defId: "computer",      col: 4, row: 2 },
      { id: "r6", defId: "armchair",      col: 5, row: 4 },
      { id: "r7", defId: "plant_big",     col: 7, row: 0 },
    ],
  },
  {
    id: "lobby", label: "Lobby", emoji: "🚪",
    col: 8, row: 12, cols: 16, rows: 6,
    floorColor: 0x111827, wallColor: 0x6366F1, accentColor: "#6366F1",
    furniture: [
      { id: "l1", defId: "couch_3",       col: 2, row: 1 },
      { id: "l2", defId: "couch_3",       col: 8, row: 1 },
      { id: "l3", defId: "coffee_table",  col: 4, row: 2 },
      { id: "l4", defId: "coffee_table",  col: 10, row: 2 },
      { id: "l5", defId: "plant_big",     col: 1, row: 4 },
      { id: "l6", defId: "plant_big",     col: 7, row: 4 },
      { id: "l7", defId: "plant_big",     col: 14, row: 4 },
      { id: "l8", defId: "vending",       col: 13, row: 1 },
      { id: "l9", defId: "water_cooler",  col: 14, row: 1 },
      { id: "l10",defId: "lamp",          col: 1, row: 1 },
    ],
  },
];

export const GRID_COLS = 24;
export const GRID_ROWS = 18;
export const TILE_W    = 64;
export const TILE_H    = 32;   // isometric height ratio
