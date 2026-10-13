import { grid, power, rooms, type Sim } from '@stillwake/sim';
import { cablePoints, endsOf, SAG, STEPS, type Point } from '../../render/cable';
import { createRope, type Body, type Rope, type RopeStyle } from '../../render/rope';

/** Aboard: gravity pulls a cable into its hang, and air slows its swing. Cells, steps of 1/60 s. */
const HANGING: RopeStyle = {
  links: STEPS,
  keep: 0.97,
  gravity: 0.004,
  drift: 0,
  driftSpeed: 0,
  wave: 0,
};
/** Out in space: nothing pulls it, and it drifts slowly as the tether does. */
const FLOATING: RopeStyle = {
  links: STEPS,
  keep: 0.95,
  gravity: 0,
  drift: 0.0005,
  driftSpeed: 0.01,
  wave: 0.35,
};
/**
 * How much longer than its span a hanging cable is: a parabola `SAG` of its span deep is that much
 * longer, so at rest it hangs where the building layer picks it. Out in space, a little slack.
 */
const HANG = 1 + (8 * SAG * SAG) / 3;
const LOOSE = 1.02;

interface Cable {
  rope: Rope;
  from: Point;
  to: Point;
  hangs: boolean;
}

/**
 * Every cable as a rope, kept between frames by its two nodes. The cables found at the start are
 * already at rest; one laid later starts straight and falls into its hang, swinging. A cable whose
 * end comes inside or goes out is a new rope.
 */
export function createCableRopes() {
  const cables = new Map<string, Cable>();
  let started = false;
  return {
    /** Takes the cables as the world has them now: new ones in, gone ones out. */
    sync(sim: Sim) {
      const q = { grid: sim.query(grid), rooms: sim.query(rooms) };
      const seen = new Set<string>();
      for (const c of sim.query(power).cables()) {
        const key = `${c.a}:${c.b}`;
        seen.add(key);
        const { from, to, hangs } = endsOf(q, c.a, c.b);
        const kept = cables.get(key);
        if (kept && kept.hangs === hangs) {
          kept.from = from;
          kept.to = to;
          continue;
        }
        const style = hangs ? HANGING : FLOATING;
        const rest = started ? undefined : cablePoints(from, to, hangs);
        cables.set(key, { rope: createRope(style, from, to, c.a + c.b, rest), from, to, hangs });
      }
      for (const key of cables.keys()) if (!seen.has(key)) cables.delete(key);
      started = true;
    },
    /** Moves every cable on by `elapsedMs`, brushed by `bodies`. */
    update(elapsedMs: number, bodies: readonly Body[]) {
      for (const c of cables.values()) {
        const factor = c.hangs ? HANG : LOOSE;
        c.rope.update(c.from, c.to, elapsedMs, (span) => span * factor, c.hangs ? bodies : []);
      }
    },
    /** Each cable's points, by its two nodes. */
    *lines(): Generator<{
      readonly a: number;
      readonly b: number;
      readonly points: readonly Point[];
    }> {
      for (const [key, c] of cables) {
        const [a, b] = key.split(':').map(Number) as [number, number];
        yield { a, b, points: c.rope.points() };
      }
    },
  };
}

export type CableRopes = ReturnType<typeof createCableRopes>;
