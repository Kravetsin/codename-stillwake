/** One cell edge of the grid near the pointer, in cells, and how strongly it is drawn. */
export interface Edge {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly alpha: number;
}

/** How far around the pointer the grid shows, in cells. */
export const NEAR = 7;
/** How strongly an edge right at the pointer is drawn. */
const STRONGEST = 0.35;

/**
 * The cell edges around `pointer` while a build tool is out, fading with the distance of each
 * edge's middle from the pointer to nothing at `NEAR`; none past the grid's edges.
 */
export function nearGrid(
  pointer: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
): Edge[] {
  const edges: Edge[] = [];
  const fade = (mx: number, my: number) => {
    const d = Math.hypot(mx - pointer.x, my - pointer.y);
    return d < NEAR ? STRONGEST * (1 - d / NEAR) : 0;
  };
  const cx = Math.floor(pointer.x);
  const cy = Math.floor(pointer.y);
  const x0 = Math.max(0, cx - NEAR);
  const x1 = Math.min(size.width, cx + NEAR + 1);
  const y0 = Math.max(0, cy - NEAR);
  const y1 = Math.min(size.height, cy + NEAR + 1);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y < y1; y++) {
      const alpha = fade(x, y + 0.5);
      if (alpha > 0) edges.push({ x1: x, y1: y, x2: x, y2: y + 1, alpha });
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x < x1; x++) {
      const alpha = fade(x + 0.5, y);
      if (alpha > 0) edges.push({ x1: x, y1: y, x2: x + 1, y2: y, alpha });
    }
  }
  return edges;
}
