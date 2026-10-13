import { MACHINES, type MachineSpec } from '@stillwake/content';
import { grid, power, type PowerNetwork, type Sim } from '@stillwake/sim';
import { Container, Graphics, Sprite } from 'pixi.js';
import { t } from '../../i18n/en';
import { endOf, middleOf, type Point } from '../../render/cable';
import { CELL } from '../../render/camera';
import { traceRope } from '../../render/rope';
import { heroBodies, overlayOn, pointerTip } from '../../session/ui';
import { lit } from '../../render/lighting';
import type { Feature, Layer } from '../feature';
import { boltTexture, pegTexture, plugTexture, unpluggedTexture } from '../../render/power-art';
import { createPowerMode } from './mode';
import { createCableRopes, type CableRopes } from './ropes';

/** A cable out of the overlay: thin and dark, a line against the back wall. */
const CABLE = 0x7c8794;
const CABLE_WIDTH = 1.25;
/** Where a cable goes through the hull: a dark fitting round it. */
const FITTING = 0x1a1e25;
/** In the overlay, cables and nodes by their network's state: fed in full, short, dark. */
const FED = 0x7fe08a;
const SHORT = 0xf0b44c;
const DARK = 0xe05555;
/** A cable on no network: none is, but a cable is drawn by its first node's. */
const LOOSE = 0x9aa3ad;
/** A cable carried by hand, bright and thicker than the rest, red where it may not be let go. */
const CARRIED = { fits: 0xffffff, refused: DARK, width: 2.5 } as const;
/** What the overlay lays over the ship, so the cables stand out from it. */
const DIM = { color: 0x05080d, alpha: 0.45 };
const REFRESH_MS = 250;

const stateColour = (n: PowerNetwork | undefined) =>
  !n ? LOOSE : n.satisfaction >= 1000 ? FED : n.satisfaction > 0 ? SHORT : DARK;

/** The cables as ropes, shared by the layer that draws them and the overlay that colours them. */
let ropes: CableRopes | undefined;
/** The hands at work on cables, let go by the cables' layer while the power overlay is off. */
let mode: ReturnType<typeof createPowerMode> | undefined;

/** Calls `draw` again only when the world has run a tick since, at most every `REFRESH_MS`. */
function everyTick(draw: (sim: Sim) => void) {
  let since = Infinity;
  let shown = -1;
  return (sim: Sim, elapsedMs: number) => {
    since += elapsedMs;
    if (since < REFRESH_MS || sim.world.tick === shown) return;
    since = 0;
    shown = sim.world.tick;
    draw(sim);
  };
}

/** How fast a bolt over a machine with no power at all blinks, in blinks a second. */
const BLINK = 1.5;

/**
 * A bolt over each machine that draws power and gets less than it would: red with none, amber with
 * some. Laid into `into`, at the middle of each machine's top.
 */
function placeBolts(into: Container, sim: Sim): void {
  for (const bolt of into.removeChildren()) bolt.destroy();
  const q = sim.query(grid);
  for (const m of q.machines()) {
    const spec: MachineSpec = MACHINES[m.kind];
    if (spec.draws === undefined) continue;
    const satisfaction = sim.query(power).satisfaction(m.id);
    if (satisfaction >= 1000) continue;
    const bolt = new Sprite(boltTexture(satisfaction === 0));
    const at = middleOf(q, m.cell);
    bolt.anchor.set(0.5, 1);
    bolt.position.set(at.x * CELL, (at.y - spec.height / 2) * CELL - 1);
    bolt.label = satisfaction === 0 ? 'none' : 'short';
    into.addChild(bolt);
  }
}

/** Blinks the bolts in `bolts` over machines with no power at all, `time` seconds in. */
function blink(bolts: Container, time: number): void {
  const on = Math.floor(time * BLINK * 2) % 2 === 0;
  for (const bolt of bolts.children) if (bolt.label === 'none') bolt.alpha = on ? 1 : 0.25;
}

/**
 * Cables out of the overlay: thin ropes hanging between their nodes inside the ship, swinging out of
 * a hero's way, and drifting loose out in space (`./ropes`), drawn behind the ship's structure, so a
 * wall or a machine they pass is in front of them.
 */
function cables(): Layer {
  const lines = new Graphics();
  // Fittings sit on the wall's face, in front of the wall the cable goes behind: a grommet where it
  // goes through the hull, a peg where it ends on a wall, a plug in each socket it is plugged into.
  const fittings = new Container();
  for (const g of [lines, fittings]) lit(g);
  // A machine short of power says so whatever is on, and glows: it is not lit.
  const bolts = new Container();
  const view = new Container();
  view.addChild(fittings, bolts);
  const own = createCableRopes();
  ropes = own;
  const sync = everyTick((sim) => {
    own.sync(sim);
    placeBolts(bolts, sim);
    placeFittings(fittings, sim, own);
  });
  let time = 0;
  return {
    view,
    behind: lines,
    update: ({ game, elapsedMs }) => {
      sync(game.client.sim, elapsedMs);
      // Out of the power overlay, nothing is held; in it, a cable's end may be carried by hand.
      if (overlayOn.get() !== 'power') mode?.release();
      own.hold(mode?.carried()?.end);
      const landing = mode?.takeLanding();
      if (landing) own.land(landing.node, landing.end);
      time += elapsedMs / 1000;
      blink(bolts, time);
      own.update(elapsedMs, heroBodies.get());
      lines.clear();
      for (const line of own.lines()) traceRope(lines, line.points, CELL);
      lines.stroke({ width: CABLE_WIDTH, color: CABLE, cap: 'round', join: 'round' });
    },
  };
}

/**
 * The fittings of every cable, laid into `into`: a grommet where it goes through the hull, and at
 * each end a plug in a machine's socket or a peg on a wall, one for every node however many cables
 * end there. Only where cables end and go through, which moves only when a cable does.
 */
function placeFittings(into: Container, sim: Sim, cables: CableRopes): void {
  for (const child of into.removeChildren()) child.destroy();
  const q = sim.query(grid);
  const grommets = new Graphics();
  const ends = new Map<number, Point>();
  for (const line of cables.lines()) {
    for (const f of line.feeds) {
      grommets.circle(f.x * CELL, f.y * CELL, 2).fill(FITTING);
      grommets.circle(f.x * CELL, f.y * CELL, 1).fill(CABLE);
    }
    for (const node of [line.a, line.b]) ends.set(node, endOf(q, node));
  }
  into.addChild(grommets);
  for (const [node, at] of ends) {
    const machine = q.machineAt(node)?.cell === node;
    const piece = new Sprite(machine ? plugTexture() : pegTexture());
    piece.anchor.set(0.5);
    piece.position.set(at.x * CELL, at.y * CELL);
    into.addChild(piece);
  }
}

/**
 * The power overlay: power brought out of the ship, the ship dimmed, and every cable over it in its network's state,
 * the very ropes the cables hang as, glowing, a dot where each is plugged in; a plug hanging loose
 * over each machine that makes or draws power with no cable to it. Beside the pointer on a node,
 * what its network makes against what it would draw. Cables are laid, moved and cut here, with the
 * cable or the plan in hand (`./mode`, 0022).
 */
function powerOverlay(): Layer {
  const view = new Container();
  const dim = new Graphics();
  const lines = new Graphics();
  const plugs = new Container();
  const bolts = new Container();
  const hands = createPowerMode();
  mode = hands;
  view.addChild(dim, lines, plugs, bolts, ...hands.views);
  let time = 0;
  let byNode = new Map<number, PowerNetwork>();
  const redraw = everyTick((sim) => {
    const q = sim.query(grid);
    const wires = sim.query(power);
    byNode = new Map();
    for (const n of wires.networks()) for (const node of n.nodes) byNode.set(node, n);
    placeBolts(bolts, sim);
    const { width, height } = q.size();
    dim
      .clear()
      .rect(0, 0, width * CELL, height * CELL)
      .fill(DIM);
    for (const plug of plugs.removeChildren()) plug.destroy();
    for (const m of q.machines()) {
      const spec: MachineSpec = MACHINES[m.kind];
      const powered = spec.makes !== undefined || spec.draws !== undefined;
      if (!powered || byNode.has(m.cell)) continue;
      const plug = new Sprite(unpluggedTexture());
      const at = middleOf(q, m.cell);
      plug.anchor.set(0.5);
      plug.position.set(at.x * CELL, at.y * CELL);
      plugs.addChild(plug);
    }
  });
  return {
    view,
    update({ game, camera, elapsedMs }) {
      const { sim } = game.client;
      redraw(sim, elapsedMs);
      time += elapsedMs / 1000;
      blink(bolts, time);
      hands.update(game, camera, [...(ropes?.lines() ?? [])]);
      // The cable carried by hand stands out from the rest.
      const carried = hands.carried();
      const holds = (a: number, b: number) =>
        carried !== undefined &&
        (carried.end.cable
          ? carried.end.cable.a === a && carried.end.cable.b === b
          : carried.end.node === a || carried.end.node === b);
      lines.clear();
      for (const { a, b, points } of ropes?.lines() ?? []) {
        const held = holds(a, b);
        const colour = held
          ? carried?.fits
            ? CARRIED.fits
            : CARRIED.refused
          : stateColour(byNode.get(a) ?? byNode.get(b));
        const width = held ? CARRIED.width : 1.25;
        traceRope(lines, points, CELL);
        lines.stroke({
          width: width * 2.4,
          color: colour,
          alpha: 0.25,
          cap: 'round',
          join: 'round',
        });
        traceRope(lines, points, CELL);
        lines.stroke({ width, color: colour, cap: 'round', join: 'round' });
        for (const end of [points[0], points[points.length - 1]]) {
          if (end) lines.circle(end.x * CELL, end.y * CELL, 1.5).fill(colour);
        }
      }
      const pointer = camera.pointer();
      const { width, height } = sim.query(grid).size();
      const x = pointer ? Math.floor(pointer.x) : -1;
      const y = pointer ? Math.floor(pointer.y) : -1;
      const onGrid = x >= 0 && y >= 0 && x < width && y < height;
      const node = onGrid ? sim.query(power).nodeAt(y * width + x) : undefined;
      const network = node === undefined ? undefined : sim.query(power).networkOf(node);
      const said = network
        ? [t('power.supply', { supply: network.supply, demand: network.demand })]
        : [];
      // Told only when it changes, as the air overlay does: the tip is React's.
      if (said.join('\n') !== (pointerTip.get().world ?? []).join('\n')) {
        pointerTip.set({ ...pointerTip.get(), world: said.length > 0 ? said : undefined });
      }
    },
  };
}

/** Power cables, behind the ship out of the overlay and in front of it with L. */
export const powerFeature: Feature = {
  id: 'power',
  layer: cables,
  overlay: { name: 'overlay.power', key: 'KeyL', layer: powerOverlay },
};
