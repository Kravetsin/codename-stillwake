import { LIGHT, MACHINES } from '@stillwake/content';
import { BACK, furnace, grid, power, STRUCTURE, type Sim } from '@stillwake/sim';
import { CELL } from '../../render/camera';
import { alphaOf, particles } from '../../render/particles';
import type { Area } from './area';
import { KIND, type Cells } from './cells';
import { brightnessOf } from './flicker';

/** Adds `share` of `colour` to what cell `i` gives off, red, green and blue. */
function give(gives: Float32Array, i: number, colour: readonly number[], share: number) {
  for (let c = 0; c < 3; c++) gives[i * 3 + c] = (gives[i * 3 + c] ?? 0) + (colour[c] ?? 0) * share;
}

/**
 * The cells of `area` as light sees `sim`'s ship now: walls and closed doors as walls, machines'
 * cells as machines; what gives off light — the stars through every open cell with no back wall
 * and everywhere past the grid's edge, a lamp by the power it gets, flickering `timeMs` in when
 * short, a working furnace's fire along its bottom, glowing particles.
 */
export function cellsOf(sim: Sim, area: Area, timeMs: number, into?: Cells): Cells {
  const { width, height } = area;
  const size = width * height;
  const cells =
    into && into.width === width && into.height === height
      ? into
      : { width, height, kind: new Uint8Array(size), gives: new Float32Array(size * 3) };
  cells.kind.fill(KIND.air);
  cells.gives.fill(0);
  const layers = sim.query(grid).layers();
  const local = (x: number, y: number) =>
    x >= area.x && y >= area.y && x < area.x + width && y < area.y + height
      ? (y - area.y) * width + (x - area.x)
      : undefined;

  for (let y = 0; y < height; y++) {
    const gy = area.y + y;
    for (let x = 0; x < width; x++) {
      const gx = area.x + x;
      const i = y * width + x;
      if (gx < 0 || gy < 0 || gx >= layers.width || gy >= layers.height) {
        give(cells.gives, i, LIGHT.star, 1);
        continue;
      }
      const cell = gy * layers.width + gx;
      const s = layers.structure[cell];
      if (s === STRUCTURE.wall || s === STRUCTURE.doorClosed) cells.kind[i] = KIND.wall;
      else if (layers.back[cell] === BACK.none) give(cells.gives, i, LIGHT.star, 1);
    }
  }

  for (const m of sim.query(grid).machines()) {
    const mx = m.cell % layers.width;
    const my = Math.floor(m.cell / layers.width);
    const spec = MACHINES[m.kind];
    if (m.kind === 'lamp') {
      const i = local(mx, my);
      const shines = brightnessOf(sim.query(power).satisfaction(m.id) / 1000, timeMs, m.id);
      if (i !== undefined && shines > 0) give(cells.gives, i, LIGHT.lamp, shines);
      continue;
    }
    const fire = m.kind === 'furnace' && sim.query(furnace).at(m.id).burning;
    for (let dy = 0; dy < spec.height; dy++) {
      for (let dx = 0; dx < spec.width; dx++) {
        const i = local(mx + dx, my + dy);
        if (i === undefined) continue;
        cells.kind[i] = KIND.machine;
        // A furnace's fire, along its bottom row.
        if (fire && dy === spec.height - 1) give(cells.gives, i, LIGHT.fire, 1);
      }
    }
  }

  for (const p of particles.live) {
    if (!p.effect.glow) continue;
    const i = local(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
    if (i === undefined) continue;
    const c = p.effect.glow.colour;
    const colour = [((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255];
    give(cells.gives, i, colour, LIGHT.particle * alphaOf(p));
  }
  return cells;
}
