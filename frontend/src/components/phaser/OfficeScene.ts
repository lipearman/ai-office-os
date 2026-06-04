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

export interface SceneData {
  bgKey: string;
  bgUrl: string;
  sprites: SpriteMeta[];
  agents: AgentSpawn[];
}

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 } as const;
type Dir = keyof typeof DIR_ROW;

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

  constructor() { super({ key: "OfficeScene" }); }

  init(data: SceneData) { this.cfg = data; }

  preload() {
    this.load.image(this.cfg.bgKey, this.cfg.bgUrl);
    for (const s of this.cfg.sprites) {
      this.load.spritesheet(s.key, s.url, { frameWidth: s.frameW, frameHeight: s.frameH });
    }
  }

  create() {
    const W = this.scale.width, H = this.scale.height;

    // Background (fill)
    this.bg = this.add.image(W / 2, H / 2, this.cfg.bgKey).setDisplaySize(W, H).setDepth(0);
    this.buildCollision();

    // Animations per sprite per direction
    for (const s of this.cfg.sprites) {
      for (const dir of ["down", "left", "right", "up"] as Dir[]) {
        const row = DIR_ROW[dir];
        const start = row * s.cols;
        const end = start + s.cols - 1;
        const key = `${s.key}-${dir}`;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(s.key, { start, end }),
            frameRate: 6,
            repeat: -1,
          });
        }
      }
    }

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
    // Scale to a consistent on-screen height (~80px)
    if (meta) {
      const targetH = 84;
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
    }).setOrigin(0.5).setDepth(11);

    this.agents.push({
      sprite, label, data: a,
      target: { x, y }, dir: "down", speed: 95,
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

    // collision: try full, then axis slides
    if (this.walkable(nx, ny)) { a.sprite.x = nx; a.sprite.y = ny; }
    else if (this.walkable(nx, a.sprite.y)) { a.sprite.x = nx; }
    else if (this.walkable(a.sprite.x, ny)) { a.sprite.y = ny; }
    else { a.target = { x: a.sprite.x, y: a.sprite.y }; }

    a.sprite.setDepth(10 + a.sprite.y * 0.001);
    a.sprite.anims.play(`${a.data.spriteKey}-${dir}`, true);
    this.syncLabel(a);
  }

  private syncLabel(a: AgentObj) {
    a.label.setPosition(a.sprite.x, a.sprite.y - a.sprite.displayHeight / 2 - 14);
    a.label.setDepth(a.sprite.depth + 1);
  }

  // ── Collision via background pixel brightness ──────────────────────────────
  private buildCollision() {
    const tex = this.textures.get(this.cfg.bgKey);
    const src = tex.getSourceImage() as HTMLImageElement;
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0);
    this.collisionCanvas = c;
    this.collisionCtx = ctx;
  }

  private walkable(worldX: number, worldY: number): boolean {
    if (!this.collisionCtx || !this.collisionCanvas) return true;
    // map world (game) coords → texture coords (bg is stretched to fill)
    const tx = Math.floor((worldX / this.scale.width) * this.collisionCanvas.width);
    const ty = Math.floor((worldY / this.scale.height) * this.collisionCanvas.height);
    if (tx < 0 || ty < 0 || tx >= this.collisionCanvas.width || ty >= this.collisionCanvas.height) return false;
    const d = this.collisionCtx.getImageData(tx, ty, 1, 1).data;
    return Math.max(d[0], d[1], d[2]) > 55;  // dark walls/border block
  }

  // ── Called from React ──────────────────────────────────────────────────────
  updateAgentStatuses(list: { id: string; status: string }[]) {
    for (const u of list) {
      const a = this.agents.find((o) => o.data.id === u.id);
      if (a) a.data.status = u.status;
    }
  }
}
