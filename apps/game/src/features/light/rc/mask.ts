import { HERO, MACHINES } from '@stillwake/content';
import { BACK, furnace, grid, power, STRUCTURE, type Sim } from '@stillwake/sim';
import { CELL } from '../../../render/camera';
import { alphaOf, particles } from '../../../render/particles';
import { lampLevel } from '../lightmap';

/**
 * What gives off light in the mask, as a share of the cascades' `emit`: the stars beyond a hole in
 * the back wall, a lamp's bulb, a furnace's fire.
 */
const SKY = [11, 12, 14];
const BULB = [255, 220, 160];
const FIRE = [255, 120, 30];

/** The part of the world on screen, in cells. */
export interface View {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const rgb = (c: readonly number[], share = 1) =>
  `rgb(${Math.round((c[0] ?? 0) * share)}, ${Math.round((c[1] ?? 0) * share)}, ${Math.round((c[2] ?? 0) * share)})`;

const hex = (colour: number) => [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff];

/**
 * Draws the scene in `view` onto `g`, the light's size: colour where light is given off, opaque
 * where it is stopped, clear where it passes. Walls, closed doors, machines and the hero stop it;
 * the stars through every open cell with no back wall, lamps, furnaces at work and glowing
 * particles give it off.
 */
export function drawMask(
  g: OffscreenCanvasRenderingContext2D,
  sim: Sim,
  view: View,
  hero: { readonly x: number; readonly y: number } | undefined,
): void {
  const { width: w, height: h } = g.canvas;
  const scale = w / view.width;
  const px = (cells: number) => cells * scale;
  const sx = (x: number) => (x - view.x) * scale;
  const sy = (y: number) => (y - view.y) * scale;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = rgb(SKY);
  g.fillRect(0, 0, w, h);

  const layers = sim.query(grid).layers();
  const x0 = Math.max(0, Math.floor(view.x));
  const y0 = Math.max(0, Math.floor(view.y));
  const x1 = Math.min(layers.width, Math.ceil(view.x + view.width));
  const y1 = Math.min(layers.height, Math.ceil(view.y + view.height));
  g.fillStyle = '#000';
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const cell = y * layers.width + x;
      const s = layers.structure[cell];
      if (s === STRUCTURE.wall || s === STRUCTURE.doorClosed) {
        g.fillRect(sx(x), sy(y), px(1) + 0.5, px(1) + 0.5);
      } else if (layers.back[cell] !== BACK.none) {
        g.clearRect(sx(x), sy(y), px(1) + 0.5, px(1) + 0.5);
      }
    }
  }

  for (const m of sim.query(grid).machines()) {
    const x = m.cell % layers.width;
    const y = Math.floor(m.cell / layers.width);
    const spec = MACHINES[m.kind];
    if (m.kind === 'lamp') {
      const level = lampLevel(sim.query(power).satisfaction(m.id));
      if (level === 0) continue;
      g.fillStyle = rgb(BULB, level / 255);
      g.fillRect(sx(x + 0.2), sy(y + 0.3), px(0.6), px(0.5));
      continue;
    }
    // A machine stands on the floor in front of the back wall, a little inside its cells' sides.
    g.fillStyle = '#000';
    g.fillRect(sx(x + 0.1), sy(y + 0.1), px(spec.width - 0.2), px(spec.height - 0.1));
    if (m.kind === 'furnace') {
      const at = sim.query(furnace).at(m.id);
      if (at && !at.problem) {
        // Its fire shows past its sides, so its light gets out into the room.
        g.fillStyle = rgb(FIRE);
        g.fillRect(sx(x - 0.05), sy(y + spec.height - 0.85), px(spec.width + 0.1), px(0.4));
      }
    }
  }

  if (hero) {
    const width = HERO.width / 1000;
    const height = HERO.height / 1000;
    g.fillStyle = '#000';
    g.fillRect(sx(hero.x - width / 2), sy(hero.y - height), px(width), px(height));
  }

  for (const p of particles.live) {
    if (!p.effect.glow) continue;
    g.fillStyle = rgb(hex(p.effect.glow.colour), alphaOf(p));
    const size = Math.max(2, px(p.size / CELL));
    g.fillRect(sx(p.x / CELL) - size / 2, sy(p.y / CELL) - size / 2, size, size);
  }
}
