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
 * longer, so at rest it hangs where it is picked by. Out in space, a little slack.
 */
const HANG = 1 + (8 * SAG * SAG) / 3;
const LOOSE = 1.02;
/**
 * How long an end let go on a node stays where it was let go, waiting for the world to move the
 * cable there: past this, the move was refused, and the end goes back to its node.
 */
const LANDING_MS = 2000;

/**
 * A cable's end carried by hand: the end at `node` of every cable there, or of `cable` alone, held
 * at `at` instead of its node.
 */
export interface Held {
  readonly node: number;
  readonly cable?: { readonly a: number; readonly b: number };
  readonly at: Point;
}

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
 * its hang, swinging. A cable's end carried by hand (`hold`) follows the hand, the rope swinging
 * after it, and a cable carried to a node (`land`) starts there in its hang, as it was carried.
 */
export function createCableRopes() {
  const cables = new Map<string, Cable>();
  let started = false;
  let held: Held | undefined;
  /** An end let go on `node`, kept where it was let go until the world has the cable there. */
  let landing: { node: number; end: Held; ms: number } | undefined;
  /**
   * The points of the one-piece cable `c` was carried from, from its node `a` to `b`: the cable
   * between its other end and the node the hand took it from, its rope's points, moving as they
   * were, turned to run as `c` does. Nothing when that cable is not one rope.
   */
  const carriedPoints = (
    c: { readonly a: number; readonly b: number },
    to: { readonly node: number; readonly end: Held },
  ): (Point & { px: number; py: number })[] | undefined => {
    const other = c.a === to.node ? c.b : c.a;
    const was = to.end.node;
    const old = cables.get(`${other}:${was}`) ?? cables.get(`${was}:${other}`);
    const rope = old?.stretches.length === 1 ? old.stretches[0]?.rope : undefined;
    if (!rope) return undefined;
    // Where each point is and was a step before, so it swings on as it did.
    const points = rope.points().map(({ x, y, px, py }) => ({ x, y, px, py }));
    // The old rope ran from its own `a`; the new one runs from `c.a`.
    const fromOther = cables.has(`${other}:${was}`);
    return fromOther === (c.a === other) ? points : points.reverse();
  };
  return {
    /** Takes the cables as the world has them now: new ones in, gone ones out. */
    sync(sim: Sim) {
      const q = { grid: sim.query(grid), rooms: sim.query(rooms) };
      const seen = new Set<string>();
      let landed = false;
      for (const c of sim.query(power).cables()) {
        const key = `${c.a}:${c.b}`;
        seen.add(key);
        const { pieces, feeds } = piecesOf(q, c.a, c.b);
        const shape = JSON.stringify(pieces);
        if (cables.get(key)?.shape === shape) continue;
        const lands = landing !== undefined && (c.a === landing.node || c.b === landing.node);
        landed ||= lands;
        // A cable carried here goes on as the very rope that was carried, from where it hangs now.
        const carried = lands && landing ? carriedPoints(c, landing) : undefined;
        const stretches = pieces.map((piece, i) => {
          const style = piece.hangs ? HANGING : FLOATING;
          const rest =
            carried && pieces.length === 1
              ? carried
              : started && !lands
                ? undefined
                : cablePoints(piece.from, piece.to, piece.hangs);
          const rope = createRope(style, piece.from, piece.to, c.a + c.b + i, rest);
          return { piece, rope };
        });
        cables.set(key, { stretches, feeds, shape });
      }
      if (landed) landing = undefined;
      for (const key of cables.keys()) if (!seen.has(key)) cables.delete(key);
      started = true;
    },
    /** Holds a cable's end by hand until the next `hold`; nothing lets every end go. */
    hold(end: Held | undefined) {
      held = end;
    },
    /**
     * `end` is let go on `node`: it stays there until the world has the cable there, which then
     * starts in its hang, as it was carried, rather than going back to where it was first.
     */
    land(node: number, end: Held) {
      landing = { node, end, ms: 0 };
    },
    /** Moves every cable on by `elapsedMs`, brushed by `bodies` aboard. */
    update(elapsedMs: number, bodies: readonly Body[]) {
      if (landing && (landing.ms += elapsedMs) > LANDING_MS) landing = undefined;
      const hand = held ?? landing?.end;
      for (const [key, c] of cables) {
        const [a, b] = key.split(':').map(Number) as [number, number];
        const carried =
          hand && (!hand.cable || (hand.cable.a === a && hand.cable.b === b)) ? hand : undefined;
        const last = c.stretches.length - 1;
        c.stretches.forEach(({ piece, rope }, i) => {
          const factor = piece.hangs ? HANG : LOOSE;
          rope.update(
            i === 0 && carried?.node === a ? carried.at : piece.from,
            i === last && carried?.node === b ? carried.at : piece.to,
            elapsedMs,
            (span) => span * factor,
            piece.hangs ? bodies : [],
          );
        });
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
