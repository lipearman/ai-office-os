import Phaser from "phaser";
import { isoToScreen } from "../utils/iso";
import { TILE_W, TILE_H } from "../data/roomLayout";

interface AgentInfo {
  id: string;
  name: string;
  agent_type: string;
  status: string;
}

export class Character extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private nameTag: Phaser.GameObjects.Text;
  private statusDot: Phaser.GameObjects.Arc;
  private selectRing: Phaser.GameObjects.Image;
  private _isoCol: number;
  private _isoRow: number;
  private _moving = false;
  private _path: { col: number; row: number }[] = [];
  private _selected = false;
  public agentInfo: AgentInfo;

  constructor(scene: Phaser.Scene, col: number, row: number, info: AgentInfo) {
    const { x, y } = isoToScreen(col, row);
    super(scene, x, y - 16);

    this.agentInfo = info;
    this._isoCol = col;
    this._isoRow = row;

    // Shadow
    this.shadow = scene.add.image(0, 28, "shadow").setAlpha(0.5).setScale(0.7);
    this.add(this.shadow);

    // Sprite
    const key = `char_${info.agent_type}`;
    const texKey = scene.textures.exists(key) ? key : "char_reception";
    this.sprite = scene.add.sprite(0, 0, texKey, 0);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.play(`walk_${info.agent_type}`, true);
    this.sprite.setScale(0.85);
    this.add(this.sprite);

    // Selection ring
    this.selectRing = scene.add.image(0, 28, "select_ring").setVisible(false).setScale(1.1);
    this.add(this.selectRing);

    // Name tag background
    const bg = scene.add.rectangle(0, -52, 0, 18, 0x000000, 0.6).setOrigin(0.5);
    this.add(bg);

    // Name label
    this.nameTag = scene.add.text(0, -52, info.name, {
      fontSize: "11px",
      color: "#ffffff",
      fontFamily: "system-ui, sans-serif",
      padding: { x: 6, y: 2 },
    }).setOrigin(0.5);
    this.add(this.nameTag);
    bg.setSize(this.nameTag.width + 12, 18);

    // Status dot
    const statusColor = this._statusColor();
    this.statusDot = scene.add.circle(
      this.nameTag.width / 2 + 10, -52,
      4, statusColor
    );
    this.add(this.statusDot);

    // Depth based on row for draw order
    this.setDepth(row * 10 + col);

    // Interaction
    this.setSize(40, 64);
    this.setInteractive({ cursor: "pointer" });
  }

  private _statusColor() {
    const s = (this.agentInfo.status || "").toUpperCase();
    if (s === "BUSY")    return 0xFBBF24;
    if (s === "OFFLINE") return 0x6B7280;
    if (s === "ERROR")   return 0xEF4444;
    return 0x4ADE80;  // IDLE = green
  }

  setSelected(v: boolean) {
    this._selected = v;
    this.selectRing.setVisible(v);
    if (v) this.selectRing.setAlpha(1);
  }

  updateStatus(status: string) {
    this.agentInfo.status = status;
    this.statusDot.setFillStyle(this._statusColor());
    const s = status.toUpperCase();
    if (s === "BUSY") {
      // faster wobble
      this.sprite.setTimeScale(1.5);
    } else {
      this.sprite.setTimeScale(1);
    }
  }

  walkTo(col: number, row: number, path: { col: number; row: number }[]) {
    this._path = path;
    this._moving = true;
    this._advancePath();
  }

  private _advancePath() {
    if (this._path.length === 0) {
      this._moving = false;
      this.sprite.stop();
      return;
    }
    const next = this._path.shift()!;
    const { x, y } = isoToScreen(next.col, next.row);
    const targetX = x;
    const targetY = y - 16;

    this.scene.tweens.add({
      targets: this,
      x: targetX, y: targetY,
      duration: 280,
      ease: "Linear",
      onComplete: () => {
        this._isoCol = next.col;
        this._isoRow = next.row;
        this.setDepth(this._isoRow * 10 + this._isoCol);
        this._advancePath();
      },
    });

    // Flip sprite based on direction
    if (next.col > this._isoCol) this.sprite.setFlipX(false);
    else if (next.col < this._isoCol) this.sprite.setFlipX(true);
  }

  get isoCol() { return this._isoCol; }
  get isoRow() { return this._isoRow; }

  idleWander(bounds: { col: number; row: number; cols: number; rows: number }) {
    // Occasionally walk to a random spot in the room
    if (this._moving) return;
    const targetCol = Phaser.Math.Between(bounds.col + 1, bounds.col + bounds.cols - 2);
    const targetRow = Phaser.Math.Between(bounds.row + 1, bounds.row + bounds.rows - 2);
    const path = this._straightPath(this._isoCol, this._isoRow, targetCol, targetRow);
    this.walkTo(targetCol, targetRow, path);
  }

  private _straightPath(sc: number, sr: number, ec: number, er: number) {
    // Simple direct path (diagonal then straight)
    const path: { col: number; row: number }[] = [];
    let c = sc; let r = sr;
    while (c !== ec || r !== er) {
      if (c < ec) c++; else if (c > ec) c--;
      if (r < er) r++; else if (r > er) r--;
      path.push({ col: c, row: r });
    }
    return path;
  }
}
