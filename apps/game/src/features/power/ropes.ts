import { grid, power, rooms, type Sim } from '@stillwake/sim';
import { cablePoints, piecesOf, SAG, STEPS, type Piece, type Point } from '../../render/cable';
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

/** A piece of a cable as a rope, between two of its fixed points. */
interface Stretch {
  readonly piece: Piece;
  readonly rope: Rope;
}

interface Cable {
  stretches: Stretch[];
  /** Where it goes through the hull. */
  feeds: Point[];
  /** What its pieces are, ends and all: a cable whose pieces change is roped anew. */
  shape: string;
}

/**
 * Every cable as ropes, a rope for each of its pieces (`piecesOf`), kept between frames by its two
 * nodes: the part aboard hangs and the part outside floats, held where it goes through the hull.
 * The cables found at the start are already at rest; one laid later starts straight and falls into
 * its hang, swinging.
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
        const { pieces, feeds } = piecesOf(q, c.a, c.b);
        const shape = JSON.stringify(pieces);
        if (cables.get(key)?.shape === shape) continue;
        const stretches = pieces.map((piece, i) => {
          const style = piece.hangs ? HANGING : FLOATING;
          const rest = started ? undefined : cablePoints(piece.from, piece.to, piece.hangs);
          return { piece, rope: createRope(style, piece.from, piece.to, c.a + c.b + i, rest) };
        });
        cables.set(key, { stretches, feeds, shape });
      }
      for (const key of cables.keys()) if (!seen.has(key)) cables.delete(key);
      started = true;
    },
    /** Moves every cable on by `elapsedMs`, brushed by `bodies` aboard. */
    update(elapsedMs: number, bodies: readonly Body[]) {
      for (const c of cables.values()) {
        for (const { piece, rope } of c.stretches) {
          const factor = piece.hangs ? HANG : LOOSE;
          rope.update(
            piece.from,
            piece.to,
            elapsedMs,
            (span) => span * factor,
            piece.hangs ? bodies : [],
          );
        }
      }
    },
    /** Each cable's points, end to end, by its two nodes, and where it goes through the hull. */
    *lines(): Generator<{
      readonly a: number;
      readonly b: number;
      readonly points: readonly Point[];
      readonly feeds: readonly Point[];
    }> {
      for (const [key, c] of cables) {
        const [a, b] = key.split(':').map(Number) as [number, number];
        const points = c.stretches.flatMap(({ rope }, i) => rope.points().slice(i === 0 ? 0 : 1));
        yield { a, b, points, feeds: c.feeds };
      }
    },
  };
}

export type CableRopes = ReturnType<typeof createCableRopes>;
