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

/** The share of light that goes on from a cell of kind `from` into one of kind `to`. */
function keeps(from: number, to: number): number {
  const out = from === KIND.wall ? LIGHT.wallOut : 1;
  const into = to === KIND.wall ? LIGHT.wallIn : to === KIND.machine ? LIGHT.machine : LIGHT.air;
  return out * into;
}

/**
 * The light in every cell of `cells`, three numbers a cell: what each gives off, spread to the
 * rest, the brightest way winning. As Terraria does it: sweeps along every row each way, then
 * every column each way, `LIGHT.rounds` times over, each cell taking what its neighbour has times
 * what crossing into it keeps. A round more lets light round one more corner.
 */
export function lightOf(cells: Cells): Float32Array {
  const { width, height, kind } = cells;
  const light = new Float32Array(cells.gives);
  /** Light from cell `a` into its neighbour `b`, if brighter than `b` has. */
  const pass = (a: number, b: number, share: number) => {
    for (let c = 0; c < 3; c++) {
      const v = (light[a * 3 + c] ?? 0) * share;
      if (v > (light[b * 3 + c] ?? 0)) light[b * 3 + c] = v;
    }
  };
  for (let round = 0; round < LIGHT.rounds; round++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 1; x < width; x++) {
        pass(row + x - 1, row + x, keeps(kind[row + x - 1] ?? 0, kind[row + x] ?? 0));
      }
      for (let x = width - 2; x >= 0; x--) {
        pass(row + x + 1, row + x, keeps(kind[row + x + 1] ?? 0, kind[row + x] ?? 0));
      }
    }
    for (let x = 0; x < width; x++) {
      for (let y = 1; y < height; y++) {
        const at = y * width + x;
        pass(at - width, at, keeps(kind[at - width] ?? 0, kind[at] ?? 0));
      }
      for (let y = height - 2; y >= 0; y--) {
        const at = y * width + x;
        pass(at + width, at, keeps(kind[at + width] ?? 0, kind[at] ?? 0));
      }
    }
  }
  return light;
}

/** `light` as the bytes of a texture, a pixel a cell: `LIGHT.ambient` more, up to white. */
export function bytesOf(light: Float32Array, into: Uint8Array): void {
  const cells = light.length / 3;
  for (let i = 0; i < cells; i++) {
    for (let c = 0; c < 3; c++) {
      const v = (light[i * 3 + c] ?? 0) + (LIGHT.ambient[c] ?? 0);
      into[i * 4 + c] = Math.min(255, Math.round(v * 255));
    }
    into[i * 4 + 3] = 255;
  }
}
