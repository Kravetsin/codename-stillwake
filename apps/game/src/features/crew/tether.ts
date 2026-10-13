import { HERO } from '@stillwake/content';
import type { Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { STEP_MS, UNIT, type Hero, type Point } from './hero';

/** A safety line's yellow, pale enough not to shout across the dark. */
const LINE = 0xd9c27a;
/** Links of the line: more bend more smoothly. */
export const LINKS = 20;
/** How much longer than the way it spans the line is let out, and the least it is. */
const SLACK = 1.25;
const SHORTEST = 1000;
/** The share of the difference the reel takes in each step, so the line pays out smoothly. */
const REEL = 0.05;
/** What each point keeps of its speed a step: in space nothing else slows it. */
const KEEP = 0.95;
/** How hard and how slowly each point is nudged about, so a loose line drifts and never rests. */
const DRIFT = 0.5;
const DRIFT_SPEED = 0.01;
/** How far apart in phase neighbouring points drift: the length of the waves along the line. */
const WAVE = 0.35;
/** Passes over the links a step: more keep the line's length truer. */
const PASSES = 12;
/** Steps a frame may take at most, so a long stall does not run the line on for seconds. */
const MOST_STEPS = 4;

/** Where a tether meets the hero: the air pack, a little above the middle of the body. */
export function clipOf(hero: Pick<Hero, 'x' | 'y'>): Point {
  return { x: hero.x, y: hero.y - HERO.height * 0.6 };
}

interface Knot {
  x: number;
  y: number;
  /** Where it was the step before: its speed, as a Verlet line keeps it. */
  px: number;
  py: number;
}

/**
 * A tether as drawn: a line of `LINKS` links between `anchor` and `clip`, each point carried on by
 * its speed and nudged by a slow drift of its own, the links held to their length, the ends pinned.
 * Paid out like a reel's line, a little longer than the way it spans, so it neither tangles near
 * the ship nor bends at the limit, where it runs straight. Drawn only: every peer moves its own.
 */
export function createTether(anchor: Point, clip: Point, seed = 0) {
  const knots: Knot[] = Array.from({ length: LINKS + 1 }, (_, i) => {
    const t = i / LINKS;
    const x = anchor.x + (clip.x - anchor.x) * t;
    const y = anchor.y + (clip.y - anchor.y) * t;
    return { x, y, px: x, py: y };
  });
  // Neighbours drift nearly alike, a wave along the line: it bends in long curves, never kinks.
  const phases = knots.map((_, i) => seed * 1.7 + i * WAVE);
  let length = Math.max(SHORTEST, Math.hypot(clip.x - anchor.x, clip.y - anchor.y));
  let time = 0;
  let owed = 0;

  const step = (from: Point, to: Point) => {
    time += 1;
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    const wanted = Math.min(HERO.tether, Math.max(SHORTEST, span * SLACK));
    length += (Math.max(wanted, span) - length) * REEL;
    length = Math.max(length, span);
    for (let i = 1; i < LINKS; i++) {
      const k = knots[i] as Knot;
      const angle = time * DRIFT_SPEED + (phases[i] ?? 0);
      const vx = (k.x - k.px) * KEEP + Math.cos(angle) * DRIFT;
      const vy = (k.y - k.py) * KEEP + Math.sin(angle * 1.3) * DRIFT;
      k.px = k.x;
      k.py = k.y;
      k.x += vx;
      k.y += vy;
    }
    const link = length / LINKS;
    for (let pass = 0; pass < PASSES; pass++) {
      pin(from, to);
      for (let i = 0; i < LINKS; i++) {
        const a = knots[i] as Knot;
        const b = knots[i + 1] as Knot;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        // A line only pulls: links shorter than their length are left to fold.
        if (d <= link || d === 0) continue;
        const pull = (d - link) / d;
        // A pinned end stays; the other end of its link takes the whole pull.
        const atA = i === 0 ? 0 : i + 1 === LINKS ? 1 : 0.5;
        const atB = i + 1 === LINKS ? 0 : i === 0 ? 1 : 0.5;
        a.x += dx * pull * atA;
        a.y += dy * pull * atA;
        b.x -= dx * pull * atB;
        b.y -= dy * pull * atB;
      }
    }
    pin(from, to);
  };

  const pin = (from: Point, to: Point) => {
    const first = knots[0] as Knot;
    const last = knots[LINKS] as Knot;
    first.x = first.px = from.x;
    first.y = first.py = from.y;
    last.x = last.px = to.x;
    last.y = last.py = to.y;
  };

  return {
    /** The anchor it was tied at: a tether tied elsewhere is a new line. */
    anchor,
    /** Moves the line on by `elapsedMs`, its ends at `from` and `to`. */
    update(from: Point, to: Point, elapsedMs: number) {
      owed += elapsedMs;
      let steps = 0;
      while (owed >= STEP_MS && steps < MOST_STEPS) {
        step(from, to);
        owed -= STEP_MS;
        steps += 1;
      }
      if (steps === MOST_STEPS) owed = 0;
      pin(from, to);
    },
    points: (): readonly Point[] => knots,
    /** How long the line is let out now. */
    length: () => length,
  };
}

export type Tether = ReturnType<typeof createTether>;

/** Draws `tether` into `g`, in pixels of the world: a smooth line through its points. */
export function drawTether(g: Graphics, tether: Tether): void {
  const px = (v: number) => (v / UNIT) * CELL;
  const points = tether.points();
  const first = points[0];
  if (!first) return;
  g.moveTo(px(first.x), px(first.y));
  // Through the middle of each link, bending at the points: no corners where links meet.
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i] as Point;
    const next = points[i + 1] as Point;
    g.quadraticCurveTo(px(p.x), px(p.y), px((p.x + next.x) / 2), px((p.y + next.y) / 2));
  }
  const last = points[points.length - 1] as Point;
  g.lineTo(px(last.x), px(last.y))
    .stroke({ width: 1, color: LINE, alpha: 0.9 })
    .circle(px(first.x), px(first.y), 1.5)
    .fill(LINE);
}
