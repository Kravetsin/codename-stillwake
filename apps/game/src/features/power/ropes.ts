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
/** How long a hanging cable is for its span, in cells. */
export const hangFor = (span: number) => span * HANG;

/** A rope for a cable being laid from `from`: it hangs as a cable aboard does. */
export function layingRope(from: Point): Rope {
  return createRope(HANGING, from, from);
}

/** A cable just laid, from node `a` at `from` to node `b` at `to`, and the rope it was laid as. */
export interface Laid {
  readonly a: number;
  readonly b: number;
  readonly from: Point;
  readonly to: Point;
  readonly rope: Rope;
}
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
  /** Cables laid by hand that the world has yet to have, drawn as the ropes they were laid as. */
  const pending = new Map<string, Laid & { ms: number }>();
  /** The points of `rope`, moving as they are, end to end the other way round when `turned`. */
  const handed = (rope: Rope, turned: boolean) => {
    const points = rope.points().map(({ x, y, px, py }) => ({ x, y, px, py }));
    return turned ? points.reverse() : points;
  };
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
    // The old rope ran from its own `a`; the new one runs from `c.a`.
    const fromOther = cables.has(`${other}:${was}`);
    return handed(rope, fromOther !== (c.a === other));
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
        // A cable carried or laid here goes on as the very rope it was in hand, as it hangs now.
        const laid = pending.get(`${c.a}:${c.b}`) ?? pending.get(`${c.b}:${c.a}`);
        if (laid) pending.delete(`${laid.a}:${laid.b}`);
        const carried = laid
          ? handed(laid.rope, laid.a !== c.a)
          : lands && landing
            ? carriedPoints(c, landing)
            : undefined;
        const stretches = pieces.map((piece, i) => {
          const style = piece.hangs ? HANGING : FLOATING;
          const rest =
            carried && pieces.length === 1
              ? carried
              : started && !lands && !laid
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
    /** A cable laid by hand: drawn as `laid.rope` until the world has it, then roped as that. */
    adopt(laid: Laid) {
      pending.set(`${laid.a}:${laid.b}`, { ...laid, ms: 0 });
    },
    /** Moves every cable on by `elapsedMs`, brushed by `bodies` aboard. */
    update(elapsedMs: number, bodies: readonly Body[]) {
      if (landing && (landing.ms += elapsedMs) > LANDING_MS) landing = undefined;
      for (const [key, laid] of pending) {
        if ((laid.ms += elapsedMs) > LANDING_MS) pending.delete(key);
        else laid.rope.update(laid.from, laid.to, elapsedMs, hangFor, bodies);
      }
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
      for (const { a, b, rope } of pending.values())
        yield { a, b, points: rope.points(), feeds: [] };
    },
  };
}

export type CableRopes = ReturnType<typeof createCableRopes>;
