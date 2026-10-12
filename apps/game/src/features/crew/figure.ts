import { HERO } from '@stillwake/content';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { UNIT, type Hero } from './hero';
import { headTurn, limbsOf, type Limbs, type Pose } from './pose';

const VISOR = 0x2b3a4a;
const PACK = 0x6b7486;
/** The far arm and leg, in the suit's colour darkened by this much, so the body reads as round. */
const FAR = 0.7;
/** Every part is outlined in the suit's colour darkened by this much, so overlapping parts separate. */
const EDGE = 0.45;
/** Milliseconds for a limb to settle into a new angle: a pose change eases, a stride barely lags. */
const SETTLE_MS = 30;
/** Slower for the head, so it follows the pointer rather than snapping to it. */
const HEAD_SETTLE_MS = 90;

const W = (HERO.width / UNIT) * CELL;
const H = (HERO.height / UNIT) * CELL;
/** Where the parts sit, in pixels from the feet, which are at the origin; forward is +x. */
const HIP = H * 0.42;
const SHOULDER = H * 0.68;
const NECK = H * 0.71;
/** A limb starts half its width above its joint, so a leg is that much longer to reach the floor. */
const LEG = { width: W * 0.34, length: HIP + W * 0.17 };
const ARM = { width: W * 0.27, length: H * 0.3 };
/** How far the air pack sticks out behind the middle: what a body lying on its back rests on. */
const BACK = W * 0.62;

function darker(colour: number, by: number): number {
  const r = Math.round(((colour >> 16) & 0xff) * by);
  const g = Math.round(((colour >> 8) & 0xff) * by);
  const b = Math.round((colour & 0xff) * by);
  return (r << 16) | (g << 8) | b;
}

/** A limb hanging from its joint at the origin, turned by its `rotation`. */
function limb(colour: number, edge: number, size: { width: number; length: number }): Graphics {
  return new Graphics()
    .roundRect(-size.width / 2, -size.width / 2, size.width, size.length, size.width / 2)
    .fill(colour)
    .stroke({ width: 1, color: edge });
}

/** `from` moved toward `to` over `elapsedMs`, settling in about `within` milliseconds. */
function settle(from: number, to: number, elapsedMs: number, within = SETTLE_MS): number {
  return from + (to - from) * Math.min(1, elapsedMs / within);
}

/** An angle settled toward `to` the short way round, so a body stops tumbling without unwinding. */
function settleAngle(from: number, to: number, elapsedMs: number): number {
  const turn = 2 * Math.PI;
  const apart = ((((to - from) % turn) + turn + Math.PI) % turn) - Math.PI;
  return settle(to - apart, to, elapsedMs);
}

/**
 * A hero's figure built from rectangles: helmet and visor, body, air pack, two arms and two legs that
 * turn at their joints. `show` places it at the hero's feet and poses it; textures replace the parts
 * later, the poses stay.
 */
export function createFigure(colour: number) {
  const far = darker(colour, FAR);
  const edge = { width: 1, color: darker(colour, EDGE) };
  const backLeg = limb(far, edge.color, LEG);
  const backArm = limb(far, edge.color, ARM);
  const frontLeg = limb(colour, edge.color, LEG);
  const frontArm = limb(colour, edge.color, ARM);
  // Hips apart, so two legs read as two even standing still.
  backLeg.position.set(-W * 0.14, -HIP);
  frontLeg.position.set(W * 0.14, -HIP);
  for (const arm of [backArm, frontArm]) arm.position.set(0, -SHOULDER);
  const torso = new Graphics()
    .rect(-BACK, -SHOULDER - H * 0.02, W * 0.22, H * 0.3)
    .fill(PACK)
    .stroke({ width: 1, color: darker(PACK, EDGE) })
    .roundRect(-W * 0.4, -NECK, W * 0.8, NECK - HIP + LEG.width / 2, W * 0.12)
    .fill(colour)
    .stroke(edge);
  const helmet = new Graphics()
    .roundRect(-W * 0.42, -H, W * 0.84, H - NECK + H * 0.02, W * 0.22)
    .fill(colour)
    .stroke(edge)
    .roundRect(W * 0.02, -H * 0.93, W * 0.38, H * 0.13, W * 0.06)
    .fill(VISOR);
  // The helmet turns at the neck.
  helmet.pivot.set(0, -NECK);
  helmet.position.set(0, -NECK);

  // The body turns and leans around its middle; `view` is placed at the feet.
  const body = new Container();
  body.pivot.set(0, -H / 2);
  body.position.set(0, -H / 2);
  // Both legs come out from under the body, which hides their joints; the near arm hangs in front.
  body.addChild(backArm, backLeg, frontLeg, torso, helmet, frontArm);
  const view = new Container();
  view.addChild(body);

  let shown: Limbs | undefined;
  let last: { x: number; y: number } | undefined;
  let travelled = 0;
  // Where the stride began: a hero setting off starts its step from standing, not mid-stride.
  let strideFrom = 0;
  let wasPose: Pose | undefined;
  let timeMs = 0;
  let head = 0;

  return {
    view,
    /**
     * Places the figure at `hero`'s feet, in thousandths of a cell, and eases it into `pose`, its
     * head turned by `hero.look` while awake.
     */
    show(hero: Hero, pose: Pose, elapsedMs: number) {
      timeMs += elapsedMs;
      // Walking backwards, away from where it faces, the stride runs backwards too.
      if (last) travelled += ((hero.x - last.x) * hero.facing + Math.abs(hero.y - last.y)) / UNIT;
      last = { x: hero.x, y: hero.y };
      if (pose !== wasPose) strideFrom = travelled;
      wasPose = pose;
      const to = limbsOf(pose, hero, travelled - strideFrom, timeMs);
      const from = shown ?? to;
      shown = {
        frontArm: settle(from.frontArm, to.frontArm, elapsedMs),
        backArm: settle(from.backArm, to.backArm, elapsedMs),
        frontLeg: settle(from.frontLeg, to.frontLeg, elapsedMs),
        backLeg: settle(from.backLeg, to.backLeg, elapsedMs),
        tilt: settleAngle(from.tilt, to.tilt, elapsedMs),
        lift: settle(from.lift, to.lift, elapsedMs),
        lying: to.lying,
      };
      // Rotations run clockwise and the figure faces +x, so forward is negative.
      frontArm.rotation = -shown.frontArm;
      backArm.rotation = -shown.backArm;
      frontLeg.rotation = -shown.frontLeg;
      backLeg.rotation = -shown.backLeg;
      body.rotation = shown.tilt;
      const awake = pose !== 'lie' && pose !== 'tumble';
      head = settle(head, awake ? (hero.look ?? 0) : 0, elapsedMs, HEAD_SETTLE_MS);
      helmet.rotation = head;
      // Lying down, the middle sinks as the body turns, so it comes to rest on the floor.
      const c = Math.abs(Math.cos(shown.tilt));
      const s = Math.abs(Math.sin(shown.tilt));
      body.position.y = shown.lying ? -(H / 2) * c - BACK * s : -H / 2 - shown.lift;
      view.position.set((hero.x / UNIT) * CELL, (hero.y / UNIT) * CELL);
      view.scale.x = hero.facing;
    },
  };
}

export type Figure = ReturnType<typeof createFigure>;

/** How `hero`'s head turns to look at `point`, in cells; straight ahead with no point. */
export function lookOf(hero: Hero, point: { x: number; y: number } | undefined): number {
  if (!point) return 0;
  const neck = { x: hero.x / UNIT, y: hero.y / UNIT - NECK / CELL };
  return headTurn((point.x - neck.x) * hero.facing, point.y - neck.y);
}
