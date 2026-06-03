import Phaser from "phaser";

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: "PreloadScene" }); }

  preload() {
    // Loading bar
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    const bar = this.add.graphics();
    const border = this.add.rectangle(w / 2, h / 2, 400, 20, 0x1f2937);
    const label = this.add.text(w / 2, h / 2 - 40, "Loading AI Office...", {
      fontSize: "18px", color: "#6366f1", fontFamily: "system-ui",
    }).setOrigin(0.5);

    this.load.on("progress", (value: number) => {
      bar.clear();
      bar.fillStyle(0x6366f1, 1);
      bar.fillRect(w / 2 - 196, h / 2 - 8, 392 * value, 16);
    });

    // Load character sprite sheet image (from docs)
    this.load.image("chars_sheet", "/sprites/characters/characters_sheet.jpg");

    // Generate textures via graphics after load
    this.load.on("complete", () => {
      this._generateTextures();
      label.destroy(); bar.destroy(); border.destroy();
    });
  }

  private _generateTextures() {
    const g = this.add.graphics();

    // Floor tile — warm wood plank
    g.clear();
    g.fillStyle(0xC4922A, 1);
    // Draw isometric diamond
    g.fillPoints([
      { x: 32, y: 0 }, { x: 64, y: 16 }, { x: 32, y: 32 }, { x: 0, y: 16 }
    ], true);
    g.lineStyle(1, 0x8B6914, 0.4);
    g.strokePoints([
      { x: 32, y: 0 }, { x: 64, y: 16 }, { x: 32, y: 32 }, { x: 0, y: 16 }
    ], true);
    g.generateTexture("tile_wood", 64, 32);

    // Tile floor — lighter
    g.clear();
    g.fillStyle(0xD4C5A9, 1);
    g.fillPoints([
      { x: 32, y: 0 }, { x: 64, y: 16 }, { x: 32, y: 32 }, { x: 0, y: 16 }
    ], true);
    g.lineStyle(1, 0xA8997A, 0.5);
    g.strokePoints([
      { x: 32, y: 0 }, { x: 64, y: 16 }, { x: 32, y: 32 }, { x: 0, y: 16 }
    ], true);
    g.generateTexture("tile_stone", 64, 32);

    // Dark floor
    g.clear();
    g.fillStyle(0x1a1a2e, 1);
    g.fillPoints([
      { x: 32, y: 0 }, { x: 64, y: 16 }, { x: 32, y: 32 }, { x: 0, y: 16 }
    ], true);
    g.lineStyle(1, 0x2d2d4e, 0.6);
    g.strokePoints([
      { x: 32, y: 0 }, { x: 64, y: 16 }, { x: 32, y: 32 }, { x: 0, y: 16 }
    ], true);
    g.generateTexture("tile_dark", 64, 32);

    // Agent shadow
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(32, 28, 40, 12);
    g.generateTexture("shadow", 64, 32);

    // Agent selection ring
    g.clear();
    g.lineStyle(3, 0x6366f1, 1);
    g.strokeEllipse(32, 28, 44, 14);
    g.generateTexture("select_ring", 64, 32);

    g.destroy();

    // Generate character sprites (chibi-style circles)
    this._generateCharSprites();
  }

  private _generateCharSprites() {
    const COLORS = {
      reception: 0x6366F1,
      ceo:       0xF59E0B,
      pm:        0xF59E0B,
      ba:        0x10B981,
      dev:       0x3B82F6,
      dba:       0x8B5CF6,
      qa:        0xEF4444,
      rag:       0xEC4899,
    };

    const FRAMES = 4;  // walk frames

    for (const [type, color] of Object.entries(COLORS)) {
      // Create a spritesheet canvas: 4 frames × 48px wide, 64px tall
      const g = this.add.graphics();
      const W = 48; const H = 64;

      for (let f = 0; f < FRAMES; f++) {
        const ox = f * W;
        const wobble = f % 2 === 0 ? 0 : 2;   // body bob

        // Shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(ox + W / 2, H - 4, 28, 8);

        // Legs
        g.fillStyle(color, 0.8);
        if (f === 0 || f === 2) {
          g.fillRect(ox + 16, H - 22 + wobble, 6, 14);
          g.fillRect(ox + 26, H - 22 - wobble, 6, 14);
        } else {
          g.fillRect(ox + 16, H - 22 - wobble, 6, 14);
          g.fillRect(ox + 26, H - 22 + wobble, 6, 14);
        }

        // Body
        const bodyColor = Phaser.Display.Color.IntegerToColor(color);
        bodyColor.brighten(20);
        g.fillStyle(bodyColor.color, 1);
        g.fillRoundedRect(ox + 11, H - 42 + wobble, 26, 22, 4);

        // Arms
        g.fillStyle(color, 0.8);
        if (f === 0 || f === 2) {
          g.fillRect(ox + 7, H - 40 + wobble, 6, 14);   // left up
          g.fillRect(ox + 35, H - 38 - wobble, 6, 14);  // right down
        } else {
          g.fillRect(ox + 7, H - 38 - wobble, 6, 14);
          g.fillRect(ox + 35, H - 40 + wobble, 6, 14);
        }

        // Head
        g.fillStyle(0xFFDAAA, 1);
        g.fillCircle(ox + W / 2, H - 52 + wobble, 13);

        // Eyes
        g.fillStyle(0x1A202C, 1);
        g.fillCircle(ox + W / 2 - 4, H - 54 + wobble, 2);
        g.fillCircle(ox + W / 2 + 4, H - 54 + wobble, 2);

        // Hair
        const hairColor = Phaser.Display.Color.IntegerToColor(color);
        hairColor.darken(10);
        g.fillStyle(hairColor.color, 1);
        g.fillCircle(ox + W / 2, H - 63 + wobble, 10);

        // Collar / accessory
        g.fillStyle(color, 1);
        g.fillRect(ox + 19, H - 42 + wobble, 10, 4);
      }

      g.generateTexture(`char_${type}`, W * FRAMES, H);
      g.destroy();
    }
  }

  create() {
    this.scene.start("OfficeScene");
  }
}
