import { HERO } from '@stillwake/content';
import { CELL } from '../../render/camera';
import { UNIT } from './hero';

/** The figure's size in pixels of the world: a chibi with a helmet near a third of its height. */
export const W = (HERO.width / UNIT) * CELL;
export const H = (HERO.height / UNIT) * CELL;

/** Where the joints sit, in pixels above the feet; forward is +x. */
export const HIP = H * 0.42;
export const SHOULDER = H * 0.61;
export const NECK = H * 0.71;

/** A limb's two segments, joint to joint, and its width; a leg's reach is the hip's height. */
export const ARM = { width: W * 0.27, upper: H * 0.145, lower: H * 0.145 };
export const LEG = { width: W * 0.34, upper: HIP * 0.5, lower: HIP * 0.5 };

/** Hips apart, so two legs read as two even standing still. */
export const HIP_APART = W * 0.14;

/**
 * Two angles for a limb, in radians: `upper` from its joint, hanging straight down at 0 and turned
 * forward when positive; `lower` the bend at the elbow or knee, forward when positive.
 */
export interface Bend {
  readonly upper: number;
  readonly lower: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where a limb bent as `bend` ends, from its joint: +x forward, +y down. */
export function endOf(bend: Bend, size: { upper: number; lower: number }): Point {
  const turn = bend.upper + bend.lower;
  return {
    x: Math.sin(bend.upper) * size.upper + Math.sin(turn) * size.lower,
    y: Math.cos(bend.upper) * size.upper + Math.cos(turn) * size.lower,
  };
}

/**
 * The bend that puts a limb's end at `target`, from its joint, or as near as it reaches. With
 * `bends` 1 the middle joint sits on the side the angles fall, as an elbow below a hand held before
 * the chest; with -1 on the side they rise, as a knee in front, or elbows pulling up a ladder.
 */
export function reach(target: Point, size: { upper: number; lower: number }, bends: 1 | -1): Bend {
  const { upper: a, lower: b } = size;
  const far = Math.hypot(target.x, target.y);
  // Never quite straight nor quite folded, where the angles turn unstable.
  const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, far));
  const toward = Math.atan2(target.x, target.y);
  const atJoint = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const atBend = Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - d * d) / (2 * a * b))));
  return { upper: toward - bends * atJoint, lower: bends * (Math.PI - atBend) };
}
