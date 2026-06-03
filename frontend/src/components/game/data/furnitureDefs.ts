export interface FurnitureDef {
  id: string;
  label: string;
  emoji: string;
  category: "desk" | "seat" | "storage" | "deco" | "tech" | "lounge";
  w: number;    // grid cells wide
  h: number;    // grid cells tall
  color: number;        // Phaser hex color for base
  colorTop: number;     // top face color (lighter)
  colorSide: number;    // side face color (darker)
}

export const FURNITURE_DEFS: FurnitureDef[] = [
  // Desks
  { id: "desk_single",  label: "Desk",         emoji: "🖥️", category: "desk",    w: 2, h: 1, color: 0x8B6914, colorTop: 0xC4922A, colorSide: 0x6B5210 },
  { id: "desk_double",  label: "Double Desk",  emoji: "💼", category: "desk",    w: 2, h: 2, color: 0x7A5C0E, colorTop: 0xB0851E, colorSide: 0x5A4608 },
  { id: "desk_corner",  label: "Corner Desk",  emoji: "📐", category: "desk",    w: 3, h: 2, color: 0x6B4F0D, colorTop: 0x9E7218, colorSide: 0x4E3809 },
  // Computers
  { id: "computer",     label: "Computer",     emoji: "💻", category: "tech",    w: 1, h: 1, color: 0x2D3748, colorTop: 0x4A5568, colorSide: 0x1A202C },
  { id: "server",       label: "Server Rack",  emoji: "🖥️", category: "tech",    w: 1, h: 2, color: 0x1A202C, colorTop: 0x2D3748, colorSide: 0x0D1117 },
  { id: "monitor_big",  label: "Big Monitor",  emoji: "📺", category: "tech",    w: 2, h: 1, color: 0x1A202C, colorTop: 0x2D3748, colorSide: 0x0D1117 },
  // Seating
  { id: "chair",        label: "Chair",        emoji: "🪑", category: "seat",    w: 1, h: 1, color: 0xE8A020, colorTop: 0xF5C842, colorSide: 0xC07018 },
  { id: "couch_2",      label: "Couch 2-seat", emoji: "🛋️", category: "lounge",  w: 2, h: 1, color: 0xB45309, colorTop: 0xD97706, colorSide: 0x92400E },
  { id: "couch_3",      label: "Couch 3-seat", emoji: "🛋️", category: "lounge",  w: 3, h: 1, color: 0x9D174D, colorTop: 0xDB2777, colorSide: 0x7C1239 },
  { id: "armchair",     label: "Armchair",     emoji: "💺", category: "lounge",  w: 1, h: 1, color: 0x065F46, colorTop: 0x059669, colorSide: 0x044C38 },
  // Storage
  { id: "bookshelf",    label: "Bookshelf",    emoji: "📚", category: "storage", w: 2, h: 1, color: 0x7C2D12, colorTop: 0xA33A18, colorSide: 0x5C2009 },
  { id: "cabinet",      label: "Cabinet",      emoji: "🗄️", category: "storage", w: 1, h: 1, color: 0x374151, colorTop: 0x6B7280, colorSide: 0x1F2937 },
  { id: "whiteboard",   label: "Whiteboard",   emoji: "📋", category: "storage", w: 2, h: 1, color: 0xF5F5F5, colorTop: 0xFFFFFF, colorSide: 0xDDDDDD },
  // Decorations
  { id: "plant_small",  label: "Small Plant",  emoji: "🌿", category: "deco",    w: 1, h: 1, color: 0x16A34A, colorTop: 0x22C55E, colorSide: 0x0F6B30 },
  { id: "plant_big",    label: "Big Plant",    emoji: "🌳", category: "deco",    w: 1, h: 1, color: 0x15803D, colorTop: 0x16A34A, colorSide: 0x0C5A28 },
  { id: "coffee_table", label: "Coffee Table", emoji: "☕", category: "lounge",  w: 1, h: 1, color: 0x92400E, colorTop: 0xD97706, colorSide: 0x6B2F0A },
  { id: "meeting_table",label: "Meeting Table",emoji: "🤝", category: "desk",    w: 4, h: 2, color: 0x6B4F0D, colorTop: 0xA37218, colorSide: 0x4E3809 },
  { id: "vending",      label: "Vending Machine",emoji:"🥤",category: "deco",    w: 1, h: 1, color: 0x1D4ED8, colorTop: 0x3B82F6, colorSide: 0x1E3A8A },
  { id: "water_cooler", label: "Water Cooler", emoji: "💧", category: "deco",    w: 1, h: 1, color: 0x0891B2, colorTop: 0x22D3EE, colorSide: 0x065F75 },
  { id: "lamp",         label: "Floor Lamp",   emoji: "💡", category: "deco",    w: 1, h: 1, color: 0x92400E, colorTop: 0xFBBF24, colorSide: 0x6B2F0A },
];

export const getFurnitureDef = (id: string) => FURNITURE_DEFS.find(f => f.id === id);
