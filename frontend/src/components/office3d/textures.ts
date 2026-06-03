import * as THREE from "three";

function canvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function woodTexture() {
  return canvas(256, 256, ctx => {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0,    "#C4922A");
    grad.addColorStop(0.15, "#B8841F");
    grad.addColorStop(0.3,  "#D4A43A");
    grad.addColorStop(0.5,  "#C4922A");
    grad.addColorStop(0.7,  "#B8841F");
    grad.addColorStop(1,    "#C4922A");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Plank lines
    for (let i = 0; i < 8; i++) {
      const y = i * 32;
      ctx.fillStyle = "rgba(80,40,0,0.25)";
      ctx.fillRect(0, y, 256, 2);
      // Knot
      if (Math.random() > 0.5) {
        ctx.beginPath();
        ctx.ellipse(30 + Math.random() * 200, y + 16, 6, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(80,40,0,0.15)";
        ctx.fill();
      }
    }
    // Grain
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 256, 0);
      ctx.lineTo(Math.random() * 256 + 10, 256);
      ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  });
}

export function stoneTexture() {
  return canvas(256, 256, ctx => {
    ctx.fillStyle = "#C8BEB0";
    ctx.fillRect(0, 0, 256, 256);

    const TILE = 64;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const offset = row % 2 === 0 ? 0 : TILE / 2;
        const x = col * TILE + offset;
        const y = row * TILE;

        // Tile variation
        const shade = 200 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `rgb(${shade},${shade - 10},${shade - 20})`;
        ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);

        // Grout
        ctx.strokeStyle = "rgba(150,140,130,0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, TILE, TILE);
      }
    }
  });
}

export function brickTexture() {
  return canvas(256, 256, ctx => {
    ctx.fillStyle = "#8B6355";
    ctx.fillRect(0, 0, 256, 256);

    const BH = 20; const BW = 40;
    for (let row = 0; row < 256 / BH; row++) {
      for (let col = -1; col < 256 / BW + 1; col++) {
        const offset = row % 2 === 0 ? 0 : BW / 2;
        const x = col * BW + offset;
        const y = row * BH;
        const r = 140 + Math.floor(Math.random() * 20);
        const g = 90 + Math.floor(Math.random() * 15);
        ctx.fillStyle = `rgb(${r},${g},80)`;
        ctx.fillRect(x + 1, y + 1, BW - 2, BH - 2);
      }
    }
  });
}

export function grassTexture() {
  return canvas(128, 128, ctx => {
    ctx.fillStyle = "#2D6A2D";
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(0,${100 + Math.random() * 60},0,0.3)`;
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 4);
    }
  });
}
