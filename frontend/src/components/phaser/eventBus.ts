import Phaser from "phaser";

// Bridge between Phaser scene and React
export const PhaserBus = new Phaser.Events.EventEmitter();

export const PEVENTS = {
  READY: "ready",
  AGENT_CLICKED: "agent-clicked",
  FURNITURE_MOVED: "furniture-moved",
  FURNITURE_SELECTED: "furniture-selected",
} as const;
