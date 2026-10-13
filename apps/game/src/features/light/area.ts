import { LIGHT } from '@stillwake/content';

/** The part of the world light is worked out over, in cells, and at how many pixels a cell. */
export interface Area {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly perCell: number;
}

/**
 * Cells the area's corner keeps to a multiple of: the coarsest probes are this many light pixels
 * apart at `LIGHT.perCell`, so the probes stay put in the world as the camera moves.
 */
export const ALIGN = 8;
/** The most light pixels across: far out, fewer pixels a cell rather than more cost a frame. */
export const MOST_PIXELS = 2048;

/**
 * The cells light is worked out over for `view`, the cells on screen: the screen and up to
 * `LIGHT.margin` around it, half the screen at most, so what lights the edge of the screen is in
 * it; its corner on a multiple of `ALIGN`. At `LIGHT.perCell` pixels a cell, halved while that
 * would pass `MOST_PIXELS`.
 */
export function areaOf(view: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): Area {
  const across = Math.min(LIGHT.margin, Math.ceil(view.width / 2));
  const down = Math.min(LIGHT.margin, Math.ceil(view.height / 2));
  const x = Math.floor((view.x - across) / ALIGN) * ALIGN;
  const y = Math.floor((view.y - down) / ALIGN) * ALIGN;
  const width = Math.ceil((view.x + view.width + across) / ALIGN) * ALIGN - x;
  const height = Math.ceil((view.y + view.height + down) / ALIGN) * ALIGN - y;
  let perCell: number = LIGHT.perCell;
  while (perCell > 1 && Math.max(width, height) * perCell > MOST_PIXELS) perCell /= 2;
  return { x, y, width, height, perCell };
}

/** Runs of cells side by side in each row for which `is` holds: one rectangle each, not one a cell. */
export function runsOf(
  width: number,
  height: number,
  is: (cell: number) => boolean,
): { x: number; y: number; length: number }[] {
  const runs: { x: number; y: number; length: number }[] = [];
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && is(y * width + x);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        runs.push({ x: start, y, length: x - start });
        start = -1;
      }
    }
  }
  return runs;
}
