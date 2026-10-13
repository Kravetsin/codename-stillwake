import { HERO } from '@stillwake/content';
import type { Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { UNIT, type Hero, type Point } from './hero';

/** A safety line's yellow, pale enough not to shout across the dark. */
const LINE = 0xd9c27a;
/** How far a slack tether bows, as a share of its slack, and at most, in thousandths of a cell. */
const BOW = 0.4;
const MOST_BOW = 2500;

/** Where a tether meets the hero: the air pack, a little above the middle of the body. */
export function clipOf(hero: Pick<Hero, 'x' | 'y'>): Point {
  return { x: hero.x, y: hero.y - HERO.height * 0.6 };
}

/**
 * The point a tether from `anchor` to `clip` bends toward: halfway along when taut, bowed down
 * from the line by part of its slack when not, as a loose line drifts.
 */
export function bendOf(anchor: Point, clip: Point): Point {
  const dx = clip.x - anchor.x;
  const dy = clip.y - anchor.y;
  const length = Math.hypot(dx, dy);
  const mid = { x: (anchor.x + clip.x) / 2, y: (anchor.y + clip.y) / 2 };
  const bow = Math.min((HERO.tether - length) * BOW, MOST_BOW);
  if (length === 0 || bow <= 0) return mid;
  // The side of the line facing down, so a loose tether sags the way the eye expects.
  const side = dx >= 0 ? 1 : -1;
  return { x: mid.x - (side * dy * bow) / length, y: mid.y + (side * dx * bow) / length };
}

/** Draws a tether from `anchor` to `clip` into `g`, in pixels of the world. */
export function drawTether(g: Graphics, anchor: Point, clip: Point): void {
  const px = (v: number) => (v / UNIT) * CELL;
  const bend = bendOf(anchor, clip);
  g.moveTo(px(anchor.x), px(anchor.y))
    .quadraticCurveTo(px(bend.x), px(bend.y), px(clip.x), px(clip.y))
    .stroke({ width: 1, color: LINE, alpha: 0.9 })
    .circle(px(anchor.x), px(anchor.y), 1.5)
    .fill(LINE);
}
