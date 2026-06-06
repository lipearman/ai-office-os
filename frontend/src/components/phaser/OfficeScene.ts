import Phaser from "phaser";
import { PhaserBus, PEVENTS } from "./eventBus";

export interface SpriteMeta {
  key: string;        // texture key
  url: string;
  frameW: number;
  frameH: number;
  cols: number;       // frames per direction row
  rows: number;       // 4 (down/left/right/up)
}

export interface AgentSpawn {
  id: string;
  name: string;
  agentType: string;
  status: string;
  spriteKey: string;
  color: string;
}

export interface FurnitureSpawn {
  id: string; url: string; x: number; y: number; w: number; h: number;
}

export interface OfficeSettings {
  charScale: number;   // 0.5 – 2  (multiplier on the ~84px base height)
  walkSpeed: number;   // px / second
  showLabels: boolean; // name tags above agents
  collision: boolean;  // walls + furniture block movement
}

export interface SceneData {
  bgKey: string;
  bgUrl: string;
  sprites: SpriteMeta[];
  agents: AgentSpawn[];
  furniture?: FurnitureSpawn[];
  settings?: Partial<OfficeSettings>;
}

const BASE_CHAR_H = 84;

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 } as const;
type Dir = keyof typeof DIR_ROW;

const furnKey = (url: string) => "furn_" + url.replace(/[^a-z0-9]/gi, "_");

interface AgentObj {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  data: AgentSpawn;
  target: { x: number; y: number };
  dir: Dir;
  speed: number;
  nextWander: number;
}

export class OfficeScene extends Phaser.Scene {
  private cfg!: SceneData;
  private agents: AgentObj[] = [];
  private selectedId: string | null = null;
  private bg?: Phaser.GameObjects.Image;
  private collisionCanvas?: HTMLCanvasElement;
  private collisionCtx?: CanvasRenderingContext2D;
  private editorMode = false;
  private furniture = new Map<string, Phaser.GameObjects.Image>();

  // adjustable "values" (driven from the editor → Settings tab)
  private charScale = 1;
  private baseSpeed = 95;
  private showLabels = true;
  private collisionEnabled = true;

  constructor() { super({ key: "OfficeScene" }); }

  init(data: SceneData) {
    this.cfg = data;
    const s = data.settings;
    if (s) {
      this.charScale = s.charScale ?? this.charScale;
      this.baseSpeed = s.walkSpeed ?? this.baseSpeed;
      this.showLabels = s.showLabels ?? this.showLabels;
      this.collisionEnabled = s.collision ?? this.collisionEnabled;
    }
  }

  preload() {
    this.load.image(this.cfg.bgKey, this.cfg.bgUrl);
    for (const s of this.cfg.sprites) {
      this.load.spritesheet(s.key, s.url, { frameWidth: s.frameW, frameHeight: s.frameH });
    }
    for (const f of this.cfg.furniture ?? []) {
      this.load.image(furnKey(f.url), f.url);
    }
  }

  create() {
    const W = this.scale.width, H = this.scale.height;

    // Background (fill)
    this.bg = this.add.image(W / 2, H / 2, this.cfg.bgKey).setDisplaySize(W, H).setDepth(0);
    this.buildCollision();

    // Animations per sprite per direction (defensive: clamp to real frame count)
    for (const s of this.cfg.sprites) {
      const tex = this.textures.get(s.key);
      // frameTotal includes the __BASE frame → real frames = frameTotal - 1
      const realFrames = Math.max(0, (tex?.frameTotal ?? 1) - 1);
      for (const dir of ["down", "left", "right", "up"] as Dir[]) {
        const row = DIR_ROW[dir];
        let start = row * s.cols;
        let end = start + s.cols - 1;
        // Clamp to what the sheet actually has; fall back to frame 0
        if (start > realFrames - 1) { start = 0; end = Math.max(0, realFrames - 1); }
        else if (end > realFrames - 1) end = realFrames - 1;
        const frames = realFrames > 0
          ? this.anims.generateFrameNumbers(s.key, { start, end })
          : [];
        const key = `${s.key}-${dir}`;
        if (frames.length > 0 && !this.anims.exists(key)) {
          this.anims.create({ key, frames, frameRate: 6, repeat: -1 });
        }
      }
    }

    // Furniture
    for (const f of this.cfg.furniture ?? []) this.spawnFurniture(f);

    // Spawn agents
    const spread = Math.min(W, 900);
    this.cfg.agents.forEach((a, i) => {
      const cols = Math.ceil(Math.sqrt(this.cfg.agents.length));
      const cx = 120 + (i % cols) * (spread / Math.max(cols, 1));
      const cy = 140 + Math.floor(i / cols) * 130;
      this.spawnAgent(a, cx, cy);
    });

    // Click handling
    this.input.on("pointerdown", (p: Phaser.Input.Pointer, hit: Phaser.GameObjects.GameObject[]) => {
      if (hit && hit.length) return; // handled by sprite
      // walk selected agent to click
      if (this.selectedId) {
        const a = this.agents.find((o) => o.data.id === this.selectedId);
        if (a) a.target = { x: p.worldX, y: p.worldY };
      }
    });

    // Camera
    this.cameras.main.setBackgroundColor("#0a0a1a");

    PhaserBus.emit(PEVENTS.READY, this);
  }

  private spawnAgent(a: AgentSpawn, x: number, y: number) {
    const meta = this.cfg.sprites.find((s) => s.key === a.spriteKey);
    const idleFrame = meta ? Math.min(1, meta.cols - 1) : 0; // middle-ish of down row
    const sprite = this.add.sprite(x, y, a.spriteKey, idleFrame).setDepth(10);
    // Scale to a consistent on-screen height (~84px × user scale)
    if (meta) {
      const targetH = BASE_CHAR_H * this.charScale;
      sprite.setScale(targetH / meta.frameH);
    }
    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () => {
      this.selectedId = a.id;
      this.agents.forEach((o) => o.sprite.setTint(0xffffff));
      sprite.setTint(0xffffaa);
      PhaserBus.emit(PEVENTS.AGENT_CLICKED, a);
    });

    const label = this.add.text(x, y - sprite.displayHeight / 2 - 14, a.name, {
      fontSize: "12px", color: "#ffffff", fontFamily: "system-ui",
      backgroundColor: a.color + "cc", padding: { x: 6, y: 2 },
    }).setOrigin(0.5).setDepth(11).setVisible(this.showLabels);

    this.agents.push({
      sprite, label, data: a,
      target: { x, y }, dir: "down", speed: this.baseSpeed,
      nextWander: this.time.now + 1000 + Math.random() * 2000,
    });
  }

  update(time: number, delta: number) {
    const dt = delta / 1000;
    for (const a of this.agents) {
      // idle wander
      if (a.data.id !== this.selectedId &&
          a.data.status !== "BUSY" && a.data.status !== "busy" &&
          time > a.nextWander) {
        a.nextWander = time + 2000 + Math.random() * 3000;
        const dist = Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, a.target.x, a.target.y);
        if (dist < 4) {
          for (let t = 0; t < 12; t++) {
            const tx = Phaser.Math.Clamp(a.sprite.x + (Math.random() - 0.5) * 260, 40, this.scale.width - 40);
            const ty = Phaser.Math.Clamp(a.sprite.y + (Math.random() - 0.5) * 200, 60, this.scale.height - 40);
            if (this.walkable(tx, ty)) { a.target = { x: tx, y: ty }; break; }
          }
        }
      }

      this.moveAgent(a, dt);
    }
  }

  private moveAgent(a: AgentObj, dt: number) {
    const dx = a.target.x - a.sprite.x;
    const dy = a.target.y - a.sprite.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 3) {
      // idle
      a.sprite.anims.stop();
      const meta = this.cfg.sprites.find((s) => s.key === a.data.spriteKey);
      if (meta) a.sprite.setFrame(DIR_ROW[a.dir] * meta.cols + Math.min(1, meta.cols - 1));
      this.syncLabel(a);
      return;
    }

    // Direction from target
    let dir: Dir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx >= 0 ? "right" : "left";
    else dir = dy >= 0 ? "down" : "up";
    a.dir = dir;

    const step = a.speed * dt;
    const nx = a.sprite.x + (dx / dist) * Math.min(step, dist);
    const ny = a.sprite.y + (dy / dist) * Math.min(step, dist);
    const footOff = a.sprite.displayHeight * 0.42; // collide at the feet

    // collision: try full, then axis slides (agent walks around obstacles)
    if (this.walkable(nx, ny + footOff)) { a.sprite.x = nx; a.sprite.y = ny; }
    else if (this.walkable(nx, a.sprite.y + footOff)) { a.sprite.x = nx; }
    else if (this.walkable(a.sprite.x, ny + footOff)) { a.sprite.y = ny; }
    else { a.target = { x: a.sprite.x, y: a.sprite.y }; }

    a.sprite.setDepth(10 + a.sprite.y * 0.001);
    const animKey = `${a.data.spriteKey}-${dir}`;
    if (this.anims.exists(animKey)) a.sprite.anims.play(animKey, true);
    this.syncLabel(a);
  }

  private syncLabel(a: AgentObj) {
    a.label.setPosition(a.sprite.x, a.sprite.y - a.sprite.displayHeight / 2 - 14);
    a.label.setDepth(a.sprite.depth + 1);
  }

  // ── Collision via background pixel brightness ──────────────────────────────
  private buildCollision(key: string = this.cfg.bgKey) {
    const tex = this.textures.get(key);
    const src = tex?.getSourceImage() as HTMLImageElement | undefined;
    if (!src) { this.collisionCtx = undefined; return; }
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0);
    this.collisionCanvas = c;
    this.collisionCtx = ctx;
  }

  private createAnimsFor(meta: SpriteMeta) {
    const tex = this.textures.get(meta.key);
    const realFrames = Math.max(0, (tex?.frameTotal ?? 1) - 1);
    for (const dir of ["down", "left", "right", "up"] as Dir[]) {
      const row = DIR_ROW[dir];
      let start = row * meta.cols, end = start + meta.cols - 1;
      if (start > realFrames - 1) { start = 0; end = Math.max(0, realFrames - 1); }
      else if (end > realFrames - 1) end = realFrames - 1;
      const frames = realFrames > 0 ? this.anims.generateFrameNumbers(meta.key, { start, end }) : [];
      const key = `${meta.key}-${dir}`;
      if (frames.length > 0 && !this.anims.exists(key)) {
        this.anims.create({ key, frames, frameRate: 6, repeat: -1 });
      }
    }
  }

  /** Replace an agent's sprite sheet live (uploaded character art). */
  updateAgentSprite(agentId: string, meta: SpriteMeta) {
    const apply = () => {
      this.createAnimsFor(meta);
      if (!this.cfg.sprites.find((s) => s.key === meta.key)) this.cfg.sprites.push(meta);
      const a = this.agents.find((o) => o.data.id === agentId);
      if (a) {
        a.data.spriteKey = meta.key;
        a.sprite.setTexture(meta.key, Math.min(1, meta.cols - 1));
        a.sprite.setScale((BASE_CHAR_H * this.charScale) / meta.frameH);
      }
    };
    if (this.textures.exists(meta.key)) apply();
    else {
      this.load.spritesheet(meta.key, meta.url, { frameWidth: meta.frameW, frameHeight: meta.frameH });
      this.load.once("complete", apply);
      this.load.start();
    }
  }

  /** Swap the background live without recreating the scene (keeps agents). */
  changeBackground(url: string) {
    const key = "bg_" + url.replace(/[^a-z0-9]/gi, "_");
    const apply = () => {
      const W = this.scale.width, H = this.scale.height;
      this.bg?.destroy();
      this.bg = this.add.image(W / 2, H / 2, key).setDisplaySize(W, H).setDepth(0);
      this.buildCollision(key);
    };
    if (this.textures.exists(key)) apply();
    else {
      this.load.image(key, url);
      this.load.once("complete", apply);
      this.load.start();
    }
  }

  private walkable(worldX: number, worldY: number): boolean {
    if (!this.collisionEnabled) return true; // collision disabled → walk anywhere
    // furniture footprints block movement (agents walk around them)
    if (!this.editorMode && this.furnitureBlocks(worldX, worldY)) return false;

    if (!this.collisionCtx || !this.collisionCanvas) return true;
    const tx = Math.floor((worldX / this.scale.width) * this.collisionCanvas.width);
    const ty = Math.floor((worldY / this.scale.height) * this.collisionCanvas.height);
    if (tx < 0 || ty < 0 || tx >= this.collisionCanvas.width || ty >= this.collisionCanvas.height) return false;
    const d = this.collisionCtx.getImageData(tx, ty, 1, 1).data;
    return Math.max(d[0], d[1], d[2]) > 55;  // dark walls/border block
  }

  /** Bottom-front footprint of each furniture piece is solid. */
  private furnitureBlocks(x: number, y: number): boolean {
    for (const img of this.furniture.values()) {
      const dw = img.displayWidth, dh = img.displayHeight;
      const left = img.x - dw * 0.36, right = img.x + dw * 0.36;
      const top = img.y - dh * 0.05, bottom = img.y + dh * 0.45;
      if (x >= left && x <= right && y >= top && y <= bottom) return true;
    }
    return false;
  }

  // ── Furniture ───────────────────────────────────────────────────────────────
  private spawnFurniture(f: FurnitureSpawn) {
    const key = furnKey(f.url);
    const create = () => {
      const img = this.add.image(f.x, f.y, key).setDisplaySize(f.w, f.h);
      img.setDepth(5 + f.y * 0.001);
      img.setData("id", f.id);
      img.on("pointerdown", () => {
        if (this.editorMode) PhaserBus.emit(PEVENTS.FURNITURE_SELECTED, f.id);
      });
      this.furniture.set(f.id, img);
      this.applyEditorTo(img);
    };
    if (this.textures.exists(key)) create();
    else {
      this.load.image(key, f.url);
      this.load.once("complete", create);
      this.load.start();
    }
  }

  private applyEditorTo(img: Phaser.GameObjects.Image) {
    if (this.editorMode) {
      img.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(img, true);
    } else {
      img.disableInteractive();
    }
  }

  // ── Called from React ──────────────────────────────────────────────────────
  updateAgentStatuses(list: { id: string; status: string }[]) {
    for (const u of list) {
      const a = this.agents.find((o) => o.data.id === u.id);
      if (a) a.data.status = u.status;
    }
  }

  setEditorMode(on: boolean) {
    this.editorMode = on;
    for (const img of this.furniture.values()) this.applyEditorTo(img);
    if (on && !this.input.listenerCount("drag")) {
      this.input.on("drag", (_: any, obj: Phaser.GameObjects.Image, dx: number, dy: number) => {
        obj.x = dx; obj.y = dy; obj.setDepth(5 + dy * 0.001);
      });
      this.input.on("dragend", (_: any, obj: Phaser.GameObjects.Image) => {
        PhaserBus.emit(PEVENTS.FURNITURE_MOVED, { id: obj.getData("id"), x: obj.x, y: obj.y });
      });
    }
  }

  syncFurniture(list: FurnitureSpawn[]) {
    const ids = new Set(list.map((f) => f.id));
    // remove deleted
    for (const [id, img] of this.furniture) {
      if (!ids.has(id)) { img.destroy(); this.furniture.delete(id); }
    }
    // add / update
    for (const f of list) {
      const ex = this.furniture.get(f.id);
      if (ex) { ex.setPosition(f.x, f.y).setDisplaySize(f.w, f.h); }
      else this.spawnFurniture(f);
    }
  }

  // ── Adjustable values (Settings tab) ─────────────────────────────────────────
  /** Resize every agent (multiplier on the ~84px base height). */
  setCharScale(scale: number) {
    this.charScale = scale;
    for (const a of this.agents) {
      const meta = this.cfg.sprites.find((s) => s.key === a.data.spriteKey);
      if (meta) a.sprite.setScale((BASE_CHAR_H * scale) / meta.frameH);
    }
  }

  /** Set walking speed (px/s) for all agents + future spawns. */
  setWalkSpeed(v: number) {
    this.baseSpeed = v;
    for (const a of this.agents) a.speed = v;
  }

  /** Toggle the name tags above agents. */
  setShowLabels(on: boolean) {
    this.showLabels = on;
    for (const a of this.agents) a.label.setVisible(on);
  }

  /** Toggle wall + furniture collision. */
  setCollision(on: boolean) {
    this.collisionEnabled = on;
  }
}
