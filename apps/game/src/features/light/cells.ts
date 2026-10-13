import { LIGHT } from '@stillwake/content';

/** What light does in a cell: crosses it, crosses a machine, or goes into a wall. */
export const KIND = { air: 0, machine: 1, wall: 2 } as const;

/**
 * A stretch of cells to light: what each is (`KIND`), and what each gives off, red, green and blue
 * in turn, three numbers a cell.
 */
export interface Cells {
  readonly width: number;
  readonly height: number;
  readonly kind: Uint8Array;
  readonly gives: Float32Array;
}

/** The alpha of a cell that is not a wall: near whole, so the colour keeps if it is multiplied in. */
export const OPEN = 250;

/** The share of light that goes on from a cell of one kind into the next, by `from × 3 + to`. */
const SHARES = (() => {
  const into = [LIGHT.air, LIGHT.machine];
  const shares = new Float32Array(9);
  for (const from of [KIND.air, KIND.machine, KIND.wall]) {
    for (const to of [KIND.air, KIND.machine, KIND.wall]) {
      shares[from * 3 + to] =
        to === KIND.wall
          ? from === KIND.wall
            ? LIGHT.wallDeep
            : LIGHT.wallIn
          : (from === KIND.wall ? LIGHT.wallOut : 1) * (into[to] ?? 1);
    }
  }
  return shares;
})();

/**
 * The light in every cell of `cells`, three numbers each: what each gives off, spread to the rest,
 * the brightest way winning. As Terraria does it: sweeps along every row each way, then every
 * column each way, `LIGHT.rounds` times over, each cell taking what its neighbour has times what
 * crossing into it keeps. A round more lets light round one more corner.
 */
export function lightOf(cells: Cells): Float32Array {
  const { width, height, kind } = cells;
  const light = new Float32Array(cells.gives);
  /** Light from cell `a` into its neighbour `b`, each colour where it is brighter. */
  const pass = (a: number, b: number) => {
    const share = SHARES[(kind[a] ?? 0) * 3 + (kind[b] ?? 0)] ?? 0;
    const from = a * 3;
    const to = b * 3;
    for (let c = 0; c < 3; c++) {
      const v = (light[from + c] ?? 0) * share;
      if (v > (light[to + c] ?? 0)) light[to + c] = v;
    }
  };
  for (let round = 0; round < LIGHT.rounds; round++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = row + 1; x < row + width; x++) pass(x - 1, x);
      for (let x = row + width - 2; x >= row; x--) pass(x + 1, x);
    }
    for (let x = 0; x < width; x++) {
      for (let at = x + width; at < width * height; at += width) pass(at - width, at);
      for (let at = x + (height - 2) * width; at >= 0; at -= width) pass(at + width, at);
    }
  }
  return light;
}

/**
 * `light` as the bytes of a texture, a pixel a cell: `LIGHT.ambient` more, up to white; its alpha
 * the cell's side, whole for a wall and `OPEN` for the rest, so it is blended only with its own
 * side as it is drawn.
 */
export function bytesOf(light: Float32Array, kind: Uint8Array, into: Uint8Array): void {
  const count = light.length / 3;
  const [r, g, b] = LIGHT.ambient;
  for (let i = 0; i < count; i++) {
    into[i * 4] = Math.min(255, ((light[i * 3] ?? 0) + r) * 255);
    into[i * 4 + 1] = Math.min(255, ((light[i * 3 + 1] ?? 0) + g) * 255);
    into[i * 4 + 2] = Math.min(255, ((light[i * 3 + 2] ?? 0) + b) * 255);
    into[i * 4 + 3] = kind[i] === KIND.wall ? 255 : OPEN;
  }
}
