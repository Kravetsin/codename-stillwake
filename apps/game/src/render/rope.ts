import type { Graphics } from 'pixi.js';

/** A point in whatever unit the rope's caller measures in. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A body moving past a rope, a hero: the box it fills and how far it moves a step. */
export interface Body {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly vx: number;
  readonly vy: number;
}

/** How a rope moves, in its caller's units and in steps of 1/60 of a second. */
export interface RopeStyle {
  /** Links between its points: more bend more smoothly. */
  readonly links: number;
  /** What each point keeps of its speed a step. */
  readonly keep: number;
  /** What gravity adds to each point's downward speed a step; 0 out in space. */
  readonly gravity: number;
  /** How hard and how slowly each point is nudged about, so a loose rope drifts and never rests. */
  readonly drift: number;
  readonly driftSpeed: number;
  /** How far apart in phase neighbouring points drift: the length of the waves along the rope. */
  readonly wave: number;
}

/** The share of a body's speed a point it brushes takes on, each step it is inside the body. */
const BRUSH = 0.12;
/** Passes over the links a step: more keep the rope's length truer. */
const PASSES = 12;
/** Steps a frame may take at most, so a long stall does not run the rope on for seconds. */
const MOST_STEPS = 4;
/** A step: the rope moves at 60 steps a second, whatever the frame rate. */
export const ROPE_STEP_MS = 1000 / 60;

interface Knot {
  x: number;
  y: number;
  /** Where it was the step before: its speed, as a Verlet rope keeps it. */
  px: number;
  py: number;
}

/**
 * A rope between two ends: points carried on by their speed, pulled by gravity and nudged by a
 * slow drift, its links held to their length and its ends pinned; brushed along by bodies moving
 * through it.
 * It starts through `start` if given, else straight from `from` to `to`, and falls from there.
 * Drawn only, never simulated: every peer moves its own.
 */
export function createRope(
  style: RopeStyle,
  from: Point,
  to: Point,
  seed = 0,
  start?: readonly Point[],
) {
  const { links } = style;
  const knots: Knot[] = Array.from({ length: links + 1 }, (_, i) => {
    const t = i / links;
    const at = start?.[i] ?? { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    return { x: at.x, y: at.y, px: at.x, py: at.y };
  });
  // Neighbours drift nearly alike, a wave along the rope: it bends in long curves, never kinks.
  const phases = knots.map((_, i) => seed * 1.7 + i * style.wave);
  let time = 0;
  let owed = 0;

  const pin = (a: Point, b: Point) => {
    const first = knots[0] as Knot;
    const last = knots[links] as Knot;
    first.x = first.px = a.x;
    first.y = first.py = a.y;
    last.x = last.px = b.x;
    last.y = last.py = b.y;
  };

  const step = (a: Point, b: Point, length: number, bodies: readonly Body[]) => {
    time += 1;
    for (let i = 1; i < links; i++) {
      const k = knots[i] as Knot;
      const angle = time * style.driftSpeed + (phases[i] ?? 0);
      const vx = (k.x - k.px) * style.keep + Math.cos(angle) * style.drift;
      const vy = (k.y - k.py) * style.keep + Math.sin(angle * 1.3) * style.drift + style.gravity;
      k.px = k.x;
      k.py = k.y;
      k.x += vx;
      k.y += vy;
      // Brushed: a point inside a moving body takes on some of its speed, and swings back after.
      for (const body of bodies) {
        if (k.x <= body.left || k.x >= body.right || k.y <= body.top || k.y >= body.bottom)
          continue;
        k.px -= body.vx * BRUSH;
        k.py -= body.vy * BRUSH;
      }
    }
    const link = length / links;
    for (let pass = 0; pass < PASSES; pass++) {
      pin(a, b);
      for (let i = 0; i < links; i++) {
        const p = knots[i] as Knot;
        const q = knots[i + 1] as Knot;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        // A rope only pulls: links shorter than their length are left to fold.
        if (d <= link || d === 0) continue;
        const pull = (d - link) / d;
        // A pinned end stays; the other end of its link takes the whole pull.
        const atP = i === 0 ? 0 : i + 1 === links ? 1 : 0.5;
        const atQ = i + 1 === links ? 0 : i === 0 ? 1 : 0.5;
        p.x += dx * pull * atP;
        p.y += dy * pull * atP;
        q.x -= dx * pull * atQ;
        q.y -= dy * pull * atQ;
      }
    }
    pin(a, b);
  };

  return {
    /**
     * Moves the rope on by `elapsedMs`, its ends at `a` and `b`, as long as `lengthFor` says each step
     * given the way its ends span, brushed by `bodies`.
     */
    update(
      a: Point,
      b: Point,
      elapsedMs: number,
      lengthFor: (span: number) => number,
      bodies: readonly Body[] = [],
    ) {
      owed += elapsedMs;
      let steps = 0;
      while (owed >= ROPE_STEP_MS && steps < MOST_STEPS) {
        step(a, b, Math.max(lengthFor(Math.hypot(b.x - a.x, b.y - a.y)), 0), bodies);
        owed -= ROPE_STEP_MS;
        steps += 1;
      }
      if (steps === MOST_STEPS) owed = 0;
      pin(a, b);
    },
    points: (): readonly Point[] => knots,
  };
}

export type Rope = ReturnType<typeof createRope>;

/**
 * Traces `points` into `g`, `scale` turning their unit into pixels of the world: through the
 * middle of each link and bending at the points, so no corners show where links meet. The caller
 * strokes it.
 */
export function traceRope(g: Graphics, points: readonly Point[], scale: number): void {
  const first = points[0];
  if (!first) return;
  g.moveTo(first.x * scale, first.y * scale);
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i] as Point;
    const next = points[i + 1] as Point;
    g.quadraticCurveTo(
      p.x * scale,
      p.y * scale,
      ((p.x + next.x) / 2) * scale,
      ((p.y + next.y) / 2) * scale,
    );
  }
  const last = points[points.length - 1] as Point;
  g.lineTo(last.x * scale, last.y * scale);
}
