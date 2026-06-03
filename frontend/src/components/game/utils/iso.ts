import { TILE_W, TILE_H } from "../data/roomLayout";

/** Convert isometric grid coordinates to screen (pixel) coordinates */
export function isoToScreen(col: number, row: number) {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  };
}

/** Convert screen (pixel) coordinates to nearest isometric grid cell */
export function screenToIso(sx: number, sy: number) {
  const col = Math.round(sx / TILE_W + sy / TILE_H);
  const row = Math.round(-sx / TILE_W + sy / TILE_H);
  return { col, row };
}

/** Depth sort value so closer tiles render on top */
export function isoDepth(col: number, row: number) {
  return (col + row) * 10;
}
