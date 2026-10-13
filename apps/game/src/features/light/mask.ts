import { MACHINES } from '@stillwake/content';
import { BACK, furnace, grid, power, STRUCTURE, type Sim } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { THINGS } from '../../render/lighting';
import { alphaOf, particles } from '../../render/particles';
import { runsOf } from './area';

/**
 * What gives off light, as colours of the mask: a share of `LIGHT.emit` each. The stars beyond a
 * hole in the back wall, a lamp's bulb at full power, a furnace's fire.
 */
const SKY = 0x0b0c0e;
const BULB = { r: 255, g: 220, b: 160 };
const FIRE = 0xff781e;
/** Reaches far enough past the grid's edge to cover any light around it, in cells. */
const BEYOND = 4096;

const scaled = (c: { r: number; g: number; b: number }, share: number) =>
  (Math.round(c.r * share) << 16) | (Math.round(c.g * share) << 8) | Math.round(c.b * share);

/**
 * The mask light is worked out from, drawn in the world's pixels: colour where light is given off,
 * alpha where it is stopped — whole for walls and closed doors, `THINGS` for machines — clear
 * where it passes. Heroes are drawn into it by the light layer from their own figures.
 */
export function createMask() {
  const root = new Container();
  const cells = new Graphics();
  const things = new Graphics();
  const glows = new Graphics();
  root.addChild(cells, things, glows);
  /** The codes the cells were last drawn from. */
  let seen: { structure: number[]; back: number[] } | undefined;

  return {
    root,
    /** Draws what stands and shines on `sim`'s ship now; the cells only when they changed. */
    draw(sim: Sim) {
      const layers = sim.query(grid).layers();
      if (!seen || !same(seen.structure, layers.structure) || !same(seen.back, layers.back)) {
        seen = { structure: Array.from(layers.structure), back: Array.from(layers.back) };
        drawCells(cells, layers);
      }

      things.clear();
      for (const m of sim.query(grid).machines()) {
        const x = (m.cell % layers.width) * CELL;
        const y = Math.floor(m.cell / layers.width) * CELL;
        const spec = MACHINES[m.kind];
        if (m.kind === 'lamp') {
          const share = sim.query(power).satisfaction(m.id) / 1000;
          if (share === 0) continue;
          things
            .rect(x + CELL * 0.2, y + CELL * 0.3, CELL * 0.6, CELL * 0.5)
            .fill(scaled(BULB, share));
          continue;
        }
        // A machine stands on the floor in front of the back wall, a little in from its sides.
        things
          .rect(
            x + CELL * 0.1,
            y + CELL * 0.1,
            (spec.width - 0.2) * CELL,
            (spec.height - 0.1) * CELL,
          )
          .fill({ color: 0, alpha: THINGS });
        if (m.kind === 'furnace') {
          const at = sim.query(furnace).at(m.id);
          // Its fire shows past its sides, so the light gets out into the room.
          if (at && !at.problem) {
            things
              .rect(
                x - CELL * 0.05,
                y + (spec.height - 0.85) * CELL,
                (spec.width + 0.1) * CELL,
                CELL * 0.4,
              )
              .fill(FIRE);
          }
        }
      }

      glows.clear();
      for (const p of particles.live) {
        if (!p.effect.glow) continue;
        const size = Math.max(CELL / 4, p.size);
        const c = p.effect.glow.colour;
        glows
          .rect(p.x - size / 2, p.y - size / 2, size, size)
          .fill(scaled({ r: (c >> 16) & 0xff, g: (c >> 8) & 0xff, b: c & 0xff }, alphaOf(p)));
      }
    },
  };
}

/**
 * The cells: walls and closed doors stopping light; the stars, giving it off, in every open cell
 * with no back wall and all round the grid past its edge; nothing in the rest.
 */
function drawCells(
  g: Graphics,
  layers: {
    readonly width: number;
    readonly height: number;
    readonly structure: ArrayLike<number>;
    readonly back: ArrayLike<number>;
  },
) {
  const { width, height } = layers;
  const blocks = (cell: number) =>
    layers.structure[cell] === STRUCTURE.wall || layers.structure[cell] === STRUCTURE.doorClosed;
  g.clear();
  const w = width * CELL;
  const h = height * CELL;
  const far = BEYOND * CELL;
  g.rect(-far, -far, w + 2 * far, far)
    .rect(-far, h, w + 2 * far, far)
    .rect(-far, 0, far, h)
    .rect(w, 0, far, h);
  for (const run of runsOf(width, height, (c) => !blocks(c) && layers.back[c] === BACK.none)) {
    g.rect(run.x * CELL, run.y * CELL, run.length * CELL, CELL);
  }
  g.fill(SKY);
  for (const run of runsOf(width, height, blocks)) {
    g.rect(run.x * CELL, run.y * CELL, run.length * CELL, CELL);
  }
  g.fill(0x000000);
}

/** Whether `kept` holds the codes `now` does, cell by cell. */
function same(kept: readonly number[], now: ArrayLike<number>): boolean {
  if (kept.length !== now.length) return false;
  for (let i = 0; i < kept.length; i++) if (kept[i] !== now[i]) return false;
  return true;
}
