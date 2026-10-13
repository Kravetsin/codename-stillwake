import { LIGHT } from '@stillwake/content';
import { BACK, STRUCTURE } from '@stillwake/sim';

/** The cells light spreads over: the grid's structure and back walls, by their stored codes. */
export interface Lit {
  readonly width: number;
  readonly height: number;
  readonly structure: ArrayLike<number>;
  readonly back: ArrayLike<number>;
}

/** Something shining: its cell and its level, up to `LIGHT.full`. */
export interface Source {
  readonly cell: number;
  readonly level: number;
}

/** Walls and closed doors take light but pass none on. */
const blocks = (grid: Lit, cell: number) => {
  const s = grid.structure[cell];
  return s === STRUCTURE.wall || s === STRUCTURE.doorClosed;
};

/** Every open cell with no back wall, space included: starlit. */
export function starsOf(grid: Lit): Source[] {
  const stars: Source[] = [];
  for (let cell = 0; cell < grid.width * grid.height; cell++) {
    if (grid.back[cell] === BACK.none && !blocks(grid, cell)) {
      stars.push({ cell, level: LIGHT.star });
    }
  }
  return stars;
}

/**
 * Light from `sources` spread into `light`, a level per cell, wherever it is brighter than what
 * is there: `LIGHT.falloff` lost a cell, `LIGHT.diagonal` a diagonal step, never round a wall's
 * corner. Brightest first, so each cell is settled once.
 */
export function shine(light: Uint8Array, grid: Lit, sources: readonly Source[]): void {
  const { width, height } = grid;
  const buckets: number[][] = Array.from({ length: LIGHT.full + 1 }, () => []);
  const raise = (cell: number, level: number) => {
    if (level <= (light[cell] ?? 0)) return;
    light[cell] = level;
    buckets[level]?.push(cell);
  };
  for (const s of sources) raise(s.cell, Math.min(LIGHT.full, s.level));
  for (let level = LIGHT.full; level > 0; level--) {
    const bucket = buckets[level] ?? [];
    for (const cell of bucket) {
      // Settled brighter since, by another way: that way spreads it.
      if (light[cell] !== level || blocks(grid, cell)) continue;
      const x = cell % width;
      const y = (cell - x) / width;
      const left = x > 0 && !blocks(grid, cell - 1);
      const right = x < width - 1 && !blocks(grid, cell + 1);
      const up = y > 0 && !blocks(grid, cell - width);
      const down = y < height - 1 && !blocks(grid, cell + width);
      const straight = level - LIGHT.falloff;
      if (straight > 0) {
        if (x > 0) raise(cell - 1, straight);
        if (x < width - 1) raise(cell + 1, straight);
        if (y > 0) raise(cell - width, straight);
        if (y < height - 1) raise(cell + width, straight);
      }
      const diagonal = level - LIGHT.diagonal;
      if (diagonal <= 0) continue;
      if (up && left) raise(cell - width - 1, diagonal);
      if (up && right) raise(cell - width + 1, diagonal);
      if (down && left) raise(cell + width - 1, diagonal);
      if (down && right) raise(cell + width + 1, diagonal);
    }
    bucket.length = 0;
  }
}

/** How much of black covers a cell lit at `level`, 0 to 255: `LIGHT.darkest` of it in the dark. */
export function darknessOf(level: number): number {
  return Math.round(((255 * LIGHT.darkest) / 1000) * (1 - level / LIGHT.full));
}

/** How bright a lamp getting `satisfaction` thousandths of its power shines: dimmer when short. */
export const lampLevel = (satisfaction: number) => Math.round((LIGHT.lamp * satisfaction) / 1000);
