import { HERO } from '@stillwake/content';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { UNIT, type Hero } from './hero';
import { headTurn, holdingPlan, limbsOf, type Limbs, type Pose } from './pose';

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

const W = (HERO.width / UNIT) * CELL;
const H = (HERO.height / UNIT) * CELL;
/** Where the parts sit, in pixels from the feet, which are at the origin; forward is +x. */
const HIP = H * 0.42;
const SHOULDER = H * 0.61;
const NECK = H * 0.71;
/** The collar between helmet and body, so the arms hang from shoulders below it, not the neck. */
const COLLAR = H * 0.045;
/** A limb starts half its width above its joint, so a leg is that much longer to reach the floor. */
const LEG = { width: W * 0.34, length: HIP + W * 0.17 };
const ARM = { width: W * 0.27, length: H * 0.3 };
/** A glove's or a boot's share of its limb's length, in limb widths. */
const END = 1.1;
/**
 * The plan's sheet, held by its near edge in the front hand: `length` along its face, `face` how
 * much of it shows tilted toward the eyes, and `skew` how far its top edge leans back to them.
 */
const PLAN = { length: W * 0.85, face: H * 0.13, skew: W * 0.18 };
/** Radians the sheet tilts its far edge up, looking straight ahead, and how much a look turns it. */
const PLAN_TILT = { ahead: 0.45, perLook: 0.6 };
/** How far the air pack sticks out behind the middle: what a body lying on its back rests on. */
const BACK = W * 0.62;

function darker(colour: number, by: number): number {
  const r = Math.round(((colour >> 16) & 0xff) * by);
  const g = Math.round(((colour >> 8) & 0xff) * by);
  const b = Math.round((colour & 0xff) * by);
  return (r << 16) | (g << 8) | b;
}

/**
 * A limb hanging from its joint at the origin, turned by its `rotation`, ending in a glove or a
 * boot; an arm has a round shoulder over its joint.
 */
function limb(
  colour: number,
  edge: number,
  size: { width: number; length: number },
  shoulder = false,
): Graphics {
  const { width: w, length } = size;
  const g = new Graphics()
    .roundRect(-w / 2, -w / 2, w, length, w / 2)
    .fill(colour)
    .stroke({ width: 1, color: edge })
    .roundRect(-w / 2, length - w / 2 - w * END, w, w * END, w / 2)
    .fill(GEAR)
    .stroke({ width: 1, color: edge });
  return shoulder
    ? g
        .circle(0, 0, w * 0.62)
        .fill(colour)
        .stroke({ width: 1, color: edge })
    : g;
}

/**
 * The plan as a sheet seen tilted toward the eyes: a blue face leaning back, a grid and a room drawn
 * on it; the middle of its near bottom edge, where the hand holds it, at the origin.
 */
function sheet(): Graphics {
  const { length: l, face: h, skew: k } = PLAN;
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
  const backArm = limb(far, edge.color, ARM, true);
  const frontLeg = limb(colour, edge.color, LEG);
  const frontArm = limb(colour, edge.color, ARM, true);
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
    .stroke(edge)
    .roundRect(-W * 0.3, -NECK - COLLAR / 2, W * 0.6, COLLAR, COLLAR / 2)
    .fill(GEAR);
  const helmet = new Graphics()
    .roundRect(-W * 0.42, -H, W * 0.84, H - NECK - COLLAR / 2, W * 0.22)
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
  const plan = sheet();
  plan.visible = false;
  // Both legs come out from under the body, which hides their joints; the near arm hangs in front,
  // its hand over the sheet it holds.
  body.addChild(backArm, backLeg, frontLeg, torso, helmet, plan, frontArm);
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
      const free = limbsOf(pose, hero, travelled - strideFrom, timeMs);
      const holding = hero.holds === 'plan' ? holdingPlan(pose, free, head) : undefined;
      const to = holding ?? free;
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
      // The sheet is in the front hand, tilted to face the eyes: up toward them looking up, flatter
      // looking down at it.
      plan.visible = holding !== undefined;
      if (holding) {
        const reach = ARM.length - ARM.width;
        plan.position.set(
          Math.sin(shown.frontArm) * reach,
          -SHOULDER + Math.cos(shown.frontArm) * reach,
        );
        plan.rotation = -PLAN_TILT.ahead + head * PLAN_TILT.perLook;
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
