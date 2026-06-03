import Phaser from "phaser";
import { isoToScreen, isoDepth } from "../utils/iso";
import { TILE_W, TILE_H } from "../data/roomLayout";
import type { FurnitureDef } from "../data/furnitureDefs";

export class FurnitureItem extends Phaser.GameObjects.Container {
  private _def: FurnitureDef;
  private _col: number;
  private _row: number;
  public instanceId: string;
  private highlight: Phaser.GameObjects.Graphics | null = null;

  constructor(
    scene: Phaser.Scene,
    col: number, row: number,
    def: FurnitureDef,
    instanceId: string,
    editable = false
  ) {
    const { x, y } = isoToScreen(col, row);
    super(scene, x, y);
    this._def = def;
    this._col = col;
    this._row = row;
    this.instanceId = instanceId;

    this._draw();
    this.setDepth(isoDepth(col, row) + 1);

    if (editable) {
      this.setSize(def.w * TILE_W, def.h * TILE_H);
      this.setInteractive({ draggable: true, cursor: "grab" });
    }
  }

  private _draw() {
    const { w, h, color, colorTop, colorSide } = this._def;
    const hw = (TILE_W / 2) * w;   // half-width of base
    const hh = (TILE_H / 2) * h;   // half-height of base
    const objH = Math.max(24, hw * 0.4);  // visual height (3D illusion)

    const g = this.scene.add.graphics();

    // ---- Isometric box ----
    // Top face (brightest)
    g.fillStyle(colorTop, 1);
    g.fillPoints([
      { x: 0,   y: -objH },
      { x: hw,  y: -objH + hh },
      { x: 0,   y: -objH + hh * 2 },
      { x: -hw, y: -objH + hh },
    ], true);

    // Left face (medium)
    g.fillStyle(color, 1);
    g.fillPoints([
      { x: -hw, y: -objH + hh },
      { x: 0,   y: -objH + hh * 2 },
      { x: 0,   y: hh * 2 - objH + objH },
      { x: -hw, y: hh },
    ], true);

    // Right face (darkest)
    g.fillStyle(colorSide, 1);
    g.fillPoints([
      { x: hw,  y: -objH + hh },
      { x: 0,   y: -objH + hh * 2 },
      { x: 0,   y: hh },
      { x: hw,  y: hh - hh },
    ], true);

    // Outline
    g.lineStyle(1, 0x000000, 0.3);
    g.strokePoints([
      { x: 0,   y: -objH },
      { x: hw,  y: -objH + hh },
      { x: 0,   y: -objH + hh * 2 },
      { x: -hw, y: -objH + hh },
    ], true);

    this.add(g);

    // Emoji label on top face
    const emoji = this.scene.add.text(0, -objH + hh - 4, this._def.emoji, {
      fontSize: `${Math.min(20, hw * 0.5)}px`,
      fontFamily: "system-ui",
    }).setOrigin(0.5, 0.5);
    this.add(emoji);
  }

  setEditorHighlight(on: boolean) {
    if (on && !this.highlight) {
      const g = this.scene.add.graphics();
      const { w, h } = this._def;
      const hw = (TILE_W / 2) * w;
      const hh = (TILE_H / 2) * h;
      g.lineStyle(2, 0xFFFF00, 0.8);
      g.strokePoints([
        { x: 0, y: -24 }, { x: hw, y: -24 + hh }, { x: 0, y: -24 + hh * 2 }, { x: -hw, y: -24 + hh }
      ], true);
      this.highlight = g;
      this.add(g);
    } else if (!on && this.highlight) {
      this.highlight.destroy();
      this.highlight = null;
    }
  }

  get isoCol() { return this._col; }
  get isoRow() { return this._row; }
  get def() { return this._def; }
}
