import { HERO } from '@stillwake/content';
import type { Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { createRope, traceRope, type RopeStyle } from '../../render/rope';
import { UNIT, type Hero, type Point } from './hero';

/** A safety line's yellow, pale enough not to shout across the dark. */
const LINE = 0xd9c27a;
/** Out in space: no gravity, only a slow drift, a wave along the line. Thousandths of a cell. */
const STYLE: RopeStyle = {
  links: 20,
  keep: 0.95,
  gravity: 0,
  drift: 0.5,
  driftSpeed: 0.01,
  wave: 0.35,
};
export const LINKS = STYLE.links;
/** How much longer than the way it spans the line is let out, and the least it is. */
const SLACK = 1.25;
const SHORTEST = 1000;
/** The share of the difference the reel takes in each step, so the line pays out smoothly. */
const REEL = 0.05;

/** Where a tether meets the hero: the air pack, a little above the middle of the body. */
export function clipOf(hero: Pick<Hero, 'x' | 'y'>): Point {
  return { x: hero.x, y: hero.y - HERO.height * 0.6 };
}

/**
 * A tether as drawn: a rope between `anchor` and `clip`, paid out like a reel's line, a little
 * longer than the way it spans, so it neither tangles near the ship nor bends at the limit, where it
 * runs straight.
 */
export function createTether(anchor: Point, clip: Point, seed = 0) {
  const rope = createRope(STYLE, anchor, clip, seed);
  let length = Math.max(SHORTEST, Math.hypot(clip.x - anchor.x, clip.y - anchor.y));
  const reel = (span: number) => {
    const wanted = Math.min(HERO.tether, Math.max(SHORTEST, span * SLACK));
    length = Math.max(length + (Math.max(wanted, span) - length) * REEL, span);
    return length;
  };
  return {
    /** The anchor it was tied at: a tether tied elsewhere is a new line. */
    anchor,
    /** Moves the line on by `elapsedMs`, its ends at `from` and `to`. */
    update(from: Point, to: Point, elapsedMs: number) {
      rope.update(from, to, elapsedMs, reel);
    },
    points: rope.points,
    /** How long the line is let out now. */
    length: () => length,
  };
}

export type Tether = ReturnType<typeof createTether>;

/** Draws `tether` into `g`, in pixels of the world: a smooth line, a clip where it is tied. */
export function drawTether(g: Graphics, tether: Tether): void {
  const scale = CELL / UNIT;
  traceRope(g, tether.points(), scale);
  g.stroke({ width: 1, color: LINE, alpha: 0.9 })
    .circle(tether.anchor.x * scale, tether.anchor.y * scale, 1.5)
    .fill(LINE);
}
