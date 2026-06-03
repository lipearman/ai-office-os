import type { AgentGameState, FurnitureItem, SpriteConfig, Direction } from "./types";

export const AGENT_SPEED = 90; // px/sec
export const WALK_FPS    = 8;  // sprite animation FPS
export const AGENT_W     = 64;
export const AGENT_H     = 96;

const DIRECTION_ROW: Record<Direction, number> = {
  down: 0, left: 1, right: 2, up: 3,
};

const AGENT_COLORS: Record<string, string> = {
  reception: "#6366f1", ceo: "#f59e0b", pm: "#f59e0b",
  ba: "#10b981", dev: "#3b82f6", dba: "#8b5cf6", qa: "#ef4444", rag: "#ec4899",
};
const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊",
  dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
};

// Image cache
const imgCache = new Map<string, HTMLImageElement>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  if (imgCache.has(url)) return Promise.resolve(imgCache.get(url)!);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => { imgCache.set(url, img); resolve(img); };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

export function getImage(url: string): HTMLImageElement | null {
  return imgCache.get(url) ?? null;
}

export function clearImageCache(url: string) {
  imgCache.delete(url);
}

// ── Agent state helpers ────────────────────────────────────────────────────

export function makeAgentState(
  id: string, name: string, agentType: string, status: string,
  x: number, y: number, sprite: SpriteConfig | null
): AgentGameState {
  return {
    id, name, agentType, status, sprite,
    x, y, targetX: x, targetY: y,
    direction: "down", walkFrame: 1, frameTimer: 0,
    walking: false,
    color: AGENT_COLORS[agentType] ?? "#6366f1",
  };
}

// Foot point of an agent placed at (x, y) top-left
export function footOf(x: number, y: number) {
  return { fx: x + AGENT_W / 2, fy: y + AGENT_H - 4 };
}

export type WalkTest = (footX: number, footY: number) => boolean;

export function updateAgent(agent: AgentGameState, dt: number, canWalk?: WalkTest): AgentGameState {
  const dx = agent.targetX - agent.x;
  const dy = agent.targetY - agent.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 2) {
    return { ...agent, walking: false, walkFrame: 1, x: agent.targetX, y: agent.targetY };
  }

  const step = AGENT_SPEED * dt;
  const mvx = (dx / dist) * Math.min(step, dist);
  const mvy = (dy / dist) * Math.min(step, dist);

  // Collision: try full move, then slide along X only, then Y only
  let nx = agent.x;
  let ny = agent.y;
  if (!canWalk) {
    nx = agent.x + mvx; ny = agent.y + mvy;
  } else {
    const full = footOf(agent.x + mvx, agent.y + mvy);
    if (canWalk(full.fx, full.fy)) {
      nx = agent.x + mvx; ny = agent.y + mvy;
    } else {
      const sx = footOf(agent.x + mvx, agent.y);
      const sy = footOf(agent.x, agent.y + mvy);
      if (canWalk(sx.fx, sx.fy)) { nx = agent.x + mvx; }
      else if (canWalk(sy.fx, sy.fy)) { ny = agent.y + mvy; }
      else {
        // Fully blocked — stop here
        return { ...agent, walking: false, walkFrame: 1, targetX: agent.x, targetY: agent.y };
      }
    }
  }

  // Direction (from actual motion)
  const adx = nx - agent.x;
  const ady = ny - agent.y;
  let direction: Direction = agent.direction;
  if (Math.abs(adx) > Math.abs(ady)) {
    direction = adx >= 0 ? "right" : "left";
  } else if (Math.abs(ady) > 0.001) {
    direction = ady > 0 ? "down" : "up";
  }

  // Walk frame cycling
  let frameTimer = agent.frameTimer + dt;
  let walkFrame  = agent.walkFrame;
  if (frameTimer >= 1 / WALK_FPS) {
    frameTimer -= 1 / WALK_FPS;
    const frames = agent.sprite?.cols ?? 3;
    walkFrame = (walkFrame + 1) % frames;
  }

  return { ...agent, x: nx, y: ny, direction, walking: true, walkFrame, frameTimer };
}

// ── Collision map (sampled from the background image) ───────────────────────

const WALL_BRIGHTNESS = 70; // pixel walkable if max(r,g,b) > this

export class CollisionMap {
  private data: Uint8ClampedArray | null = null;
  private w = 0;
  private h = 0;

  /** Build from the background image, replicating the cover/contain/fill draw. */
  build(img: HTMLImageElement | null, fit: string, W: number, H: number) {
    this.w = W; this.h = H;
    if (!img || W === 0 || H === 0) { this.data = null; return; }
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const ctx = off.getContext("2d", { willReadFrequently: true })!;

    const iw = img.naturalWidth, ih = img.naturalHeight;
    let dx = 0, dy = 0, dw = W, dh = H;
    if (fit === "cover") {
      const s = Math.max(W / iw, H / ih);
      dw = iw * s; dh = ih * s; dx = (W - dw) / 2; dy = (H - dh) / 2;
    } else if (fit === "contain") {
      const s = Math.min(W / iw, H / ih);
      dw = iw * s; dh = ih * s; dx = (W - dw) / 2; dy = (H - dh) / 2;
    }
    if (fit === "tile") {
      const pat = ctx.createPattern(img, "repeat");
      if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); }
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    try {
      this.data = ctx.getImageData(0, 0, W, H).data;
    } catch {
      this.data = null; // cross-origin taint — fall back to no collision
    }
  }

  isWalkable(x: number, y: number): boolean {
    if (!this.data) return true;            // no map → everywhere walkable
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return false; // off-canvas
    const i = (iy * this.w + ix) * 4;
    const r = this.data[i], g = this.data[i + 1], b = this.data[i + 2];
    return Math.max(r, g, b) > WALL_BRIGHTNESS;
  }
}

// ── Draw helpers ───────────────────────────────────────────────────────────

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  url: string | null,
  fit: string,
  w: number, h: number
) {
  if (!url) {
    // Default gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#1a1a2e");
    grad.addColorStop(1, "#16213e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Grid overlay
    ctx.strokeStyle = "rgba(99,102,241,0.1)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    return;
  }

  const img = getImage(url);
  if (!img) return;

  if (fit === "tile") {
    const pat = ctx.createPattern(img, "repeat");
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, w, h); }
    return;
  }

  const iw = img.naturalWidth; const ih = img.naturalHeight;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  let dx = 0, dy = 0, dw = w, dh = h;

  if (fit === "cover") {
    const scale = Math.max(w / iw, h / ih);
    dw = iw * scale; dh = ih * scale;
    dx = (w - dw) / 2; dy = (h - dh) / 2;
  } else if (fit === "contain") {
    const scale = Math.min(w / iw, h / ih);
    dw = iw * scale; dh = ih * scale;
    dx = (w - dw) / 2; dy = (h - dh) / 2;
  }

  ctx.drawImage(img, dx, dy, dw, dh);
}

export function drawFurniture(ctx: CanvasRenderingContext2D, item: FurnitureItem, selected: boolean) {
  if (item.imageUrl) {
    const img = getImage(item.imageUrl);
    if (img) {
      ctx.drawImage(img, item.x, item.y, item.width, item.height);
      if (selected) {
        ctx.strokeStyle = "#6366f1";
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(item.x - 2, item.y - 2, item.width + 4, item.height + 4);
        ctx.setLineDash([]);
      }
      return;
    }
  }

  // Fallback: colored rect with emoji
  ctx.fillStyle = selected ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.07)";
  ctx.fillRect(item.x, item.y, item.width, item.height);
  ctx.strokeStyle = selected ? "#6366f1" : "rgba(255,255,255,0.2)";
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(item.x, item.y, item.width, item.height);

  ctx.font = `${Math.min(item.width, item.height) * 0.5}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(item.emoji, item.x + item.width / 2, item.y + item.height / 2);
}

export function drawAgent(ctx: CanvasRenderingContext2D, agent: AgentGameState, selected: boolean) {
  const cx = agent.x;
  const cy = agent.y;
  const w  = AGENT_W;
  const h  = AGENT_H;

  // Shadow
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx + w / 2, cy + h + 4, w * 0.4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (agent.sprite) {
    const img = getImage(agent.sprite.url);
    if (img) {
      const cols = agent.sprite.cols || 1;
      const rows = agent.sprite.rows || 1;
      // Derive frame size from the image when not explicitly set (frameW/H = 0)
      const fw = agent.sprite.frameW || Math.floor(img.naturalWidth / cols);
      const fh = agent.sprite.frameH || Math.floor(img.naturalHeight / rows);
      // Clamp direction row to rows the sheet actually has (single-row → always 0)
      const row = Math.min(DIRECTION_ROW[agent.direction], rows - 1);
      const col = agent.walking ? (agent.walkFrame % cols) : Math.min(1, cols - 1);
      // Preserve aspect ratio: scale frame to fit AGENT_H, center horizontally
      const aspect = fw / fh;
      const dh = h;
      const dw = dh * aspect;
      const dx = cx + (w - dw) / 2;
      ctx.drawImage(img, col * fw, row * fh, fw, fh, dx, cy, dw, dh);
    } else {
      drawFallbackAgent(ctx, agent, cx, cy, w, h);
    }
  } else {
    drawFallbackAgent(ctx, agent, cx, cy, w, h);
  }

  // Selection ring
  if (selected) {
    ctx.strokeStyle = agent.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx + w / 2, cy + h + 2, w * 0.45, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Name tag
  const name = agent.name;
  ctx.font = "bold 11px system-ui";
  const tw = ctx.measureText(name).width;
  const tx = cx + w / 2 - tw / 2 - 6;
  const ty = cy - 20;

  ctx.fillStyle = agent.color + "cc";
  roundRect(ctx, tx, ty, tw + 12, 18, 5);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(name, tx + 6, ty + 9);

  // Busy dots
  if (agent.status === "BUSY" || agent.status === "busy") {
    for (let i = 0; i < 3; i++) {
      const t = (Date.now() / 400 + i * 0.33) % 1;
      const dy2 = Math.sin(t * Math.PI) * 4;
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(cx + w / 2 - 8 + i * 8, cy - 28 - dy2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFallbackAgent(
  ctx: CanvasRenderingContext2D,
  agent: AgentGameState,
  x: number, y: number, w: number, h: number
) {
  const c = agent.color;

  // Body
  ctx.fillStyle = c;
  roundRect(ctx, x + 8, y + h * 0.4, w - 16, h * 0.45, 4);
  ctx.fill();

  // Head
  ctx.fillStyle = "#ffdaaa";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.3, w * 0.28, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.2, w * 0.26, Math.PI, 0);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#1a202c";
  ctx.beginPath(); ctx.arc(x + w / 2 - 5, y + h * 0.28, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w / 2 + 5, y + h * 0.28, 2.5, 0, Math.PI * 2); ctx.fill();

  // Walk legs
  if (agent.walking) {
    const kick = Math.sin(Date.now() / 100) * 6;
    ctx.fillStyle = "#374151";
    roundRect(ctx, x + 10, y + h * 0.83, 10, h * 0.2, 3);
    ctx.fill();
    ctx.save();
    ctx.translate(x + w / 2, y + h * 0.83);
    ctx.rotate(kick * 0.05);
    roundRect(ctx, 2, 0, 10, h * 0.2, 3);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = "#374151";
    roundRect(ctx, x + 10, y + h * 0.83, 10, h * 0.17, 3); ctx.fill();
    roundRect(ctx, x + w - 20, y + h * 0.83, 10, h * 0.17, 3); ctx.fill();
  }

  // Emoji label
  ctx.font = "14px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const emoji = AGENT_EMOJI[agent.agentType] ?? "🤖";
  ctx.fillText(emoji, x + w / 2, y + h * 0.55);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
