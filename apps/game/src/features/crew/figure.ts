import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { UNIT, type Hero } from './hero';
import {
  headTurn,
  holdsIn,
  LAND,
  limbsOf,
  SHEET as SHEET_SIZE,
  sheetTurn,
  type Limbs,
  type Pose,
} from './pose';
import { ARM, endOf, H, HIP, HIP_APART, LEG, NECK, SHOULDER, W, type Bend } from './rig';

const VISOR = 0x2b3a4a;
/** The plan's sheet: blueprint blue, a pale edge and the faint grid of a drawing. */
const SHEET = 0x2f6fd0;
const SHEET_EDGE = 0xbcd8ff;
const SHEET_GRID = 0xe8f2ff;
const PACK = 0x6b7486;
/** Gloves, boots and the collar the helmet sits on: the suit's hard parts, the same on every suit. */
const GEAR = 0x3d4452;
/** The far arm and leg, in the suit's colour darkened by this much, so the body reads as round. */
const FAR = 0.7;
/** Every part is outlined in the suit's colour darkened by this much, so overlapping parts separate. */
const EDGE = 0.45;
/** Milliseconds for a limb to settle into a new angle: a pose change eases, a stride barely lags. */
const SETTLE_MS = 30;
/** Slower for the head, so it follows the pointer rather than snapping to it. */
const HEAD_SETTLE_MS = 90;

/** The collar between helmet and body, so the arms hang from shoulders below it, not the neck. */
const COLLAR = H * 0.045;
/** How far the air pack sticks out behind the middle: what a body lying on its back rests on. */
const BACK = W * 0.62;

function darker(colour: number, by: number): number {
  const r = Math.round(((colour >> 16) & 0xff) * by);
  const g = Math.round(((colour >> 8) & 0xff) * by);
  const b = Math.round((colour & 0xff) * by);
  return (r << 16) | (g << 8) | b;
}

/** A capsule from its joint at the origin `length` down, its ends round, so a bend has no seam. */
function capsule(g: Graphics, width: number, length: number, colour: number, edge: number) {
  return g
    .roundRect(-width / 2, -width / 2, width, length + width, width / 2)
    .fill(colour)
    .stroke({ width: 1, color: edge });
}

/**
 * A limb hanging from its joint at the origin in two segments, `upper` turned at the joint and
 * `lower` at the elbow or knee, ending in a glove, or a boot pointing forward; an arm has a round
 * shoulder over its joint.
 */
function limb(
  colour: number,
  edge: number,
  size: { width: number; upper: number; lower: number },
  kind: 'arm' | 'leg',
) {
  const w = size.width;
  const upper = new Container();
  const lower = new Container();
  lower.position.set(0, size.upper);
  const shin = new Graphics()
    .roundRect(-w / 2, -w / 2, w, size.lower + w / 2, w / 2)
    .fill(colour)
    .stroke({ width: 1, color: edge });
  if (kind === 'leg') {
    shin
      .roundRect(-w * 0.5, size.lower - w * 0.75, w * 1.45, w * 0.75, w * 0.3)
      .fill(GEAR)
      .stroke({ width: 1, color: edge });
  } else {
    shin
      .roundRect(-w * 0.58, size.lower - w * 1.05, w * 1.16, w * 1.05, w * 0.5)
      .fill(GEAR)
      .stroke({ width: 1, color: edge });
  }
  lower.addChild(shin);
  const thigh = capsule(new Graphics(), w, size.upper, colour, edge);
  if (kind === 'arm')
    thigh
      .circle(0, 0, w * 0.56)
      .fill(colour)
      .stroke({ width: 1, color: edge });
  // The upper segment over the lower, so the joint between them is one rounded curve.
  upper.addChild(lower, thigh);
  return {
    view: upper,
    /** Rotations run clockwise and the figure faces +x, so forward is negative. */
    bend(b: Bend) {
      upper.rotation = -b.upper;
      lower.rotation = -b.lower;
    },
  };
}

/**
 * The plan as a sheet seen tilted toward the eyes: a blue face leaning back, a grid and a room drawn
 * on it; the middle of its near bottom edge, where the hand holds it, at the origin.
 */
function sheet(): Graphics {
  const { length: l, face: h, skew: k } = SHEET_SIZE;
  const at = (along: number, up: number) => ({ x: along * l - up * k, y: -up * h });
  const corners = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
  const g = new Graphics()
    .poly(corners.flatMap((p) => [p.x, p.y]))
    .fill(SHEET)
    .stroke({ width: 1, color: SHEET_EDGE });
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    g.moveTo(a.x, a.y).lineTo(b.x, b.y);
  for (const along of [0.25, 0.5, 0.75]) line(at(along, 0), at(along, 1));
  line(at(0, 0.5), at(1, 0.5)).stroke({ width: 0.5, color: SHEET_GRID, alpha: 0.35 });
  const room = [at(0.3, 0.2), at(0.7, 0.2), at(0.7, 0.8), at(0.3, 0.8)];
  return g
    .poly(room.flatMap((p) => [p.x, p.y]))
    .stroke({ width: 1, color: SHEET_GRID, alpha: 0.9 });
}

/** `from` moved toward `to` over `elapsedMs`, settling in about `within` milliseconds. */
function settle(from: number, to: number, elapsedMs: number, within = SETTLE_MS): number {
  return from + (to - from) * Math.min(1, elapsedMs / within);
}

/** A bend settled toward `to`, segment by segment. */
function settleBend(from: Bend, to: Bend, elapsedMs: number): Bend {
  return {
    upper: settle(from.upper, to.upper, elapsedMs),
    lower: settle(from.lower, to.lower, elapsedMs),
  };
}

/** An angle settled toward `to` the short way round, so a body stops tumbling without unwinding. */
function settleAngle(from: number, to: number, elapsedMs: number): number {
  const turn = 2 * Math.PI;
  const apart = ((((to - from) % turn) + turn + Math.PI) % turn) - Math.PI;
  return settle(to - apart, to, elapsedMs);
}

/**
 * A hero's figure built from rounded shapes: helmet and visor, body, air pack, two arms and two legs
 * that bend at shoulders and elbows, hips and knees. `show` places it at the hero's feet and poses it; textures replace the parts
 * later, the poses stay.
 */
export function createFigure(colour: number) {
  const far = darker(colour, FAR);
  const edge = { width: 1, color: darker(colour, EDGE) };
  const backLeg = limb(far, edge.color, LEG, 'leg');
  const backArm = limb(far, edge.color, ARM, 'arm');
  const frontLeg = limb(colour, edge.color, LEG, 'leg');
  const frontArm = limb(colour, edge.color, ARM, 'arm');
  backLeg.view.position.set(-HIP_APART, -HIP);
  frontLeg.view.position.set(HIP_APART, -HIP);
  for (const arm of [backArm, frontArm]) arm.view.position.set(0, -SHOULDER);
  const torso = new Graphics()
    .rect(-BACK, -SHOULDER - H * 0.02, W * 0.22, H * 0.3)
    .fill(PACK)
    .stroke({ width: 1, color: darker(PACK, EDGE) })
    .roundRect(-W * 0.4, -NECK, W * 0.8, NECK - HIP + LEG.width * 0.6, W * 0.12)
    .fill(colour)
    .stroke(edge)
    .roundRect(-W * 0.3, -NECK - COLLAR / 2, W * 0.6, COLLAR, COLLAR / 2)
    .fill(GEAR);
  const helmet = new Graphics()
    .roundRect(-W * 0.42, -H, W * 0.84, H - NECK - COLLAR / 2, W * 0.22)
    .fill(colour)
    .stroke(edge)
    .roundRect(W * 0.0, -H * 0.935, W * 0.42, H * 0.14, W * 0.07)
    .fill(VISOR);
  // The helmet turns at the neck.
  helmet.pivot.set(0, -NECK);
  helmet.position.set(0, -NECK);

  // The body turns and leans around its middle; `view` is placed at the feet.
  const body = new Container();
  body.pivot.set(0, -H / 2);
  body.position.set(0, -H / 2);
  const plan = sheet();
  plan.visible = false;
  // Both legs come out from under the body, which hides their joints; the near arm hangs in front,
  // its hand over the sheet it holds.
  body.addChild(backArm.view, backLeg.view, frontLeg.view, torso, helmet, plan, frontArm.view);
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
  /** Milliseconds of a landing still to spring back from. */
  let landingMs = 0;

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
      if (wasPose === 'air' && (pose === 'stand' || pose === 'walk')) landingMs = LAND.ms;
      landingMs = Math.max(0, landingMs - elapsedMs);
      wasPose = pose;
      const holding = hero.holds === 'plan' && holdsIn(pose);
      const to = limbsOf(pose, hero, {
        travelled: travelled - strideFrom,
        timeMs,
        landing: landingMs / LAND.ms,
        ...(holding ? { plan: head } : {}),
      });
      const from = shown ?? to;
      shown = {
        frontArm: settleBend(from.frontArm, to.frontArm, elapsedMs),
        backArm: settleBend(from.backArm, to.backArm, elapsedMs),
        frontLeg: settleBend(from.frontLeg, to.frontLeg, elapsedMs),
        backLeg: settleBend(from.backLeg, to.backLeg, elapsedMs),
        tilt: settleAngle(from.tilt, to.tilt, elapsedMs),
        lift: settle(from.lift, to.lift, elapsedMs),
        lying: to.lying,
      };
      frontArm.bend(shown.frontArm);
      backArm.bend(shown.backArm);
      frontLeg.bend(shown.frontLeg);
      backLeg.bend(shown.backLeg);
      body.rotation = shown.tilt;
      const awake = pose !== 'lie' && pose !== 'tumble';
      head = settle(head, awake ? (hero.look ?? 0) : 0, elapsedMs, HEAD_SETTLE_MS);
      helmet.rotation = head;
      // The sheet is in the front hand, tilted to face the eyes: up toward them looking up, flatter
      // looking down at it.
      plan.visible = holding;
      if (holding) {
        const hand = endOf(shown.frontArm, ARM);
        plan.position.set(hand.x, -SHOULDER + hand.y);
        plan.rotation = sheetTurn(head);
      }
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
