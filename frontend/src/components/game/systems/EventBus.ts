import Phaser from "phaser";

// Shared event bus between Phaser scenes and React
export const EventBus = new Phaser.Events.EventEmitter();

export const EVENTS = {
  SCENE_READY:      "scene-ready",
  AGENT_CLICKED:    "agent-clicked",
  ROOM_CLICKED:     "room-clicked",
  AGENT_MOVED:      "agent-moved",
  EDITOR_PLACE:     "editor-place",
  EDITOR_REMOVE:    "editor-remove",
  LAYOUT_CHANGED:   "layout-changed",
} as const;
