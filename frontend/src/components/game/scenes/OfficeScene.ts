import Phaser from "phaser";
import { isoToScreen, screenToIso, isoDepth } from "../utils/iso";
import { DEFAULT_LAYOUT, TILE_W, TILE_H, GRID_COLS, GRID_ROWS, type RoomDef, type FurnitureInstance } from "../data/roomLayout";
import { FURNITURE_DEFS, getFurnitureDef } from "../data/furnitureDefs";
import { Character } from "../objects/Character";
import { FurnitureItem } from "../objects/FurnitureItem";
import { EventBus, EVENTS } from "../systems/EventBus";

interface AgentData {
  id: string;
  name: string;
  agent_type: string;
  status: string;
  room_id?: string | null;
}

interface GameConfig {
  agents: AgentData[];
  layout?: RoomDef[];
}

const AGENT_ROOM: Record<string, string> = {
  reception: "lobby", ceo: "ceo", pm: "ceo",
  ba: "ba", dev: "dev", dba: "dba", qa: "qa", rag: "rag",
};

export class OfficeScene extends Phaser.Scene {
  private rooms: RoomDef[] = [];
  private floorTiles: Phaser.GameObjects.Image[] = [];
  private characters = new Map<string, Character>();
  private furnitureItems = new Map<string, FurnitureItem>();
  private roomLabels: Phaser.GameObjects.Container[] = [];
  private selectedChar: Character | null = null;
  private _editorMode = false;
  private _editorFurnitureType: string | null = null;
  private ghostFurniture: FurnitureItem | null = null;
  private wanderTimers: Phaser.Time.TimerEvent[] = [];

  constructor() { super({ key: "OfficeScene" }); }

  init(config: GameConfig) {
    this.rooms = config?.layout ?? DEFAULT_LAYOUT;
  }

  create(config: GameConfig) {
    this.rooms = config?.layout ?? DEFAULT_LAYOUT;

    // Dark background
    this.cameras.main.setBackgroundColor(0x050510);

    // Create walk animations for each agent type
    this._createAnimations();

    // Build the isometric floor + rooms
    this._buildFloor();
    this._buildRooms();
    this._buildFurniture();
    this._buildRoomLabels();

    // Spawn agents
    if (config?.agents) {
      this._spawnAgents(config.agents);
    }

    // Setup camera: start centered
    const centerX = (GRID_COLS - GRID_ROWS) * (TILE_W / 2) / 2;
    const centerY = (GRID_COLS + GRID_ROWS) * (TILE_H / 2) / 2;
    this.cameras.main.centerOn(centerX, centerY);
    this.cameras.main.setZoom(0.75);

    // Camera drag
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this._editorMode) return;
      this.cameras.main.scrollX -= (p.x - p.prevPosition.x) / this.cameras.main.zoom;
      this.cameras.main.scrollY -= (p.y - p.prevPosition.y) / this.cameras.main.zoom;
    });

    // Camera zoom
    this.input.on("wheel", (_: any, __: any, ___: any, dy: number) => {
      const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.4, 2);
      this.cameras.main.setZoom(zoom);
    });

    // Click on empty floor: deselect / move agent
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this._handleFloorClick(p);
    });

    // Start idle wander loop
    this._startWanderLoop();

    // Tell React the scene is ready
    EventBus.emit(EVENTS.SCENE_READY, this);
  }

  // ── Private builders ──────────────────────────────────────────────────────

  private _createAnimations() {
    const types = ["reception","ceo","pm","ba","dev","dba","qa","rag"];
    for (const t of types) {
      const key = `char_${t}`;
      if (!this.textures.exists(key)) continue;
      if (!this.anims.exists(`walk_${t}`)) {
        this.anims.create({
          key: `walk_${t}`,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: 3 }),
          frameRate: 6,
          repeat: -1,
        });
      }
      if (!this.anims.exists(`idle_${t}`)) {
        this.anims.create({
          key: `idle_${t}`,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: 0 }),
          frameRate: 1,
          repeat: -1,
        });
      }
    }
  }

  private _buildFloor() {
    for (let c = 0; c < GRID_COLS; c++) {
      for (let r = 0; r < GRID_ROWS; r++) {
        const room = this._roomAt(c, r);
        const texKey = room ? this._floorTex(room.floorColor) : "tile_dark";
        const { x, y } = isoToScreen(c, r);
        const tile = this.add.image(x, y, texKey)
          .setOrigin(0.5, 0.5)
          .setDepth(isoDepth(c, r));
        this.floorTiles.push(tile);
      }
    }
  }

  private _floorTex(color: number): string {
    if (color === 0x8B4513 || color === 0xC4922A) return "tile_wood";
    if (color === 0xD4C5A9 || color === 0x111827) return "tile_stone";
    return "tile_dark";
  }

  private _buildRooms() {
    for (const room of this.rooms) {
      this._drawRoomWalls(room);
    }
  }

  private _drawRoomWalls(room: RoomDef) {
    const g = this.add.graphics();
    g.lineStyle(3, Phaser.Display.Color.HexStringToColor(room.accentColor).color, 0.8);

    // Top-left edge (north wall)
    const tl = isoToScreen(room.col, room.row);
    const tr = isoToScreen(room.col + room.cols, room.row);
    const bl = isoToScreen(room.col, room.row + room.rows);
    const br = isoToScreen(room.col + room.cols, room.row + room.rows);

    g.strokePoints([tl, tr, br, bl, tl], false);

    // Inner glow line (slightly inset)
    g.lineStyle(1, Phaser.Display.Color.HexStringToColor(room.accentColor).color, 0.3);
    const pad = 4;
    const tl2 = { x: tl.x, y: tl.y + pad };
    const tr2 = { x: tr.x, y: tr.y + pad };
    const br2 = { x: br.x, y: br.y - pad };
    const bl2 = { x: bl.x, y: bl.y - pad };
    g.strokePoints([tl2, tr2, br2, bl2, tl2], false);

    // Depth: render walls above floor but below objects
    const cx = (tl.x + br.x) / 2;
    const cy = (tl.y + br.y) / 2;
    g.setDepth(isoDepth(room.col + room.cols / 2, room.row + room.rows / 2) - 1);
  }

  private _buildFurniture() {
    for (const room of this.rooms) {
      for (const fi of room.furniture) {
        this._placeFurniture(room, fi);
      }
    }
  }

  private _placeFurniture(room: RoomDef, fi: FurnitureInstance) {
    const def = getFurnitureDef(fi.defId);
    if (!def) return;
    const col = room.col + fi.col;
    const row = room.row + fi.row;
    const item = new FurnitureItem(this, col, row, def, fi.id, this._editorMode);
    this.add.existing(item);
    this.furnitureItems.set(fi.id, item);

    // Click furniture in editor mode
    item.on("pointerdown", () => {
      if (this._editorMode) {
        EventBus.emit(EVENTS.EDITOR_REMOVE, { instanceId: fi.id, roomId: room.id });
      }
    });
  }

  private _buildRoomLabels() {
    for (const room of this.rooms) {
      const cx = room.col + room.cols / 2;
      const cy = room.row + room.rows * 0.15;
      const { x, y } = isoToScreen(cx, cy);

      const bg = this.add.rectangle(x, y - 8, 0, 24, 0x000000, 0.65)
        .setDepth(isoDepth(cx, cy) + 100);

      const label = this.add.text(x, y - 8, `${room.emoji}  ${room.label}`, {
        fontSize: "11px",
        color: room.accentColor,
        fontFamily: "system-ui, sans-serif",
        fontStyle: "bold",
        padding: { x: 8, y: 4 },
      })
        .setOrigin(0.5, 0.5)
        .setDepth(isoDepth(cx, cy) + 101);

      bg.setSize(label.width + 16, 24);

      const container = this.add.container(0, 0, [bg, label]);
      this.roomLabels.push(container);
    }
  }

  private _spawnAgents(agents: AgentData[]) {
    const roomCharCount: Record<string, number> = {};

    for (const agent of agents) {
      const roomId = AGENT_ROOM[agent.agent_type] ?? "lobby";
      const room = this.rooms.find(r => r.id === roomId);
      if (!room) continue;

      const count = roomCharCount[roomId] ?? 0;
      roomCharCount[roomId] = count + 1;

      // Spread characters within room
      const offsetCol = (count % 3) * 2 + 1;
      const offsetRow = Math.floor(count / 3) * 2 + 1;
      const col = Math.min(room.col + offsetCol, room.col + room.cols - 2);
      const row = Math.min(room.row + offsetRow, room.row + room.rows - 2);

      const char = new Character(this, col, row, {
        id: agent.id,
        name: agent.name,
        agent_type: agent.agent_type,
        status: agent.status,
      });

      this.add.existing(char);
      this.characters.set(agent.id, char);

      char.on("pointerdown", (p: Phaser.Input.Pointer) => {
        p.event.stopPropagation();
        this._selectCharacter(char);
        EventBus.emit(EVENTS.AGENT_CLICKED, { agent });
      });
    }
  }

  private _selectCharacter(char: Character) {
    this.selectedChar?.setSelected(false);
    this.selectedChar = char;
    char.setSelected(true);
  }

  private _handleFloorClick(p: Phaser.Input.Pointer) {
    if (this._editorMode && this._editorFurnitureType) {
      this._placeGhostFurniture(p);
      return;
    }

    // Deselect
    if (this.selectedChar) {
      const worldPt = this.cameras.main.getWorldPoint(p.x, p.y);
      const { col, row } = screenToIso(worldPt.x, worldPt.y);

      // Walk selected character to click point
      if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
        const path = this._buildPath(this.selectedChar.isoCol, this.selectedChar.isoRow, col, row);
        this.selectedChar.walkTo(col, row, path);
        EventBus.emit(EVENTS.AGENT_MOVED, { agentId: this.selectedChar.agentInfo.id, col, row });
      }
    }
  }

  private _buildPath(sc: number, sr: number, ec: number, er: number) {
    // Simple straight-line path (A* would go here)
    const path: { col: number; row: number }[] = [];
    let c = sc; let r = sr;
    const MAX = 50;
    let steps = 0;
    while ((c !== ec || r !== er) && steps++ < MAX) {
      if (c < ec) c++;
      else if (c > ec) c--;
      if (r < er) r++;
      else if (r > er) r--;
      path.push({ col: c, row: r });
    }
    return path;
  }

  private _startWanderLoop() {
    for (const [, char] of this.characters) {
      const roomId = AGENT_ROOM[char.agentInfo.agent_type] ?? "lobby";
      const room = this.rooms.find(r => r.id === roomId);
      if (!room) continue;

      const timer = this.time.addEvent({
        delay: Phaser.Math.Between(4000, 12000),
        loop: true,
        callback: () => {
          if (char.agentInfo.status === "BUSY" || char.agentInfo.status === "busy") return;
          char.idleWander(room);
        },
      });
      this.wanderTimers.push(timer);
    }
  }

  private _placeGhostFurniture(p: Phaser.Input.Pointer) {
    if (!this._editorFurnitureType) return;
    const worldPt = this.cameras.main.getWorldPoint(p.x, p.y);
    const { col, row } = screenToIso(worldPt.x, worldPt.y);
    const def = getFurnitureDef(this._editorFurnitureType);
    const room = this._roomAt(col, row);
    if (!def || !room) return;

    const fi: FurnitureInstance = {
      id: `editor_${Date.now()}`,
      defId: this._editorFurnitureType,
      col: col - room.col,
      row: row - room.row,
    };

    this._placeFurniture(room, fi);
    EventBus.emit(EVENTS.EDITOR_PLACE, { roomId: room.id, furniture: fi });
  }

  // ── Public API (called from React) ────────────────────────────────────────

  setEditorMode(on: boolean) {
    this._editorMode = on;
    // Highlight all furniture items
    for (const [, item] of this.furnitureItems) {
      item.setEditorHighlight(on);
    }
  }

  setEditorFurnitureType(typeId: string | null) {
    this._editorFurnitureType = typeId;
  }

  updateAgents(agents: AgentData[]) {
    for (const agent of agents) {
      const char = this.characters.get(agent.id);
      if (char) char.updateStatus(agent.status);
    }
  }

  removeFurnitureInstance(instanceId: string, roomId: string) {
    const room = this.rooms.find(r => r.id === roomId);
    if (room) {
      room.furniture = room.furniture.filter(f => f.id !== instanceId);
    }
    const item = this.furnitureItems.get(instanceId);
    if (item) {
      item.destroy();
      this.furnitureItems.delete(instanceId);
    }
  }

  getRoomLayout(): RoomDef[] {
    return this.rooms;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _roomAt(col: number, row: number): RoomDef | undefined {
    return this.rooms.find(r =>
      col >= r.col && col < r.col + r.cols &&
      row >= r.row && row < r.row + r.rows
    );
  }
}
