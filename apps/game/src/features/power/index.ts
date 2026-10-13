import { MACHINES, type MachineSpec } from '@stillwake/content';
import { grid, power, type PowerNetwork, type Sim } from '@stillwake/sim';
import { Container, Graphics, Sprite } from 'pixi.js';
import { t } from '../../i18n/en';
import { middleOf } from '../../render/cable';
import { CELL } from '../../render/camera';
import { traceRope } from '../../render/rope';
import { heroBodies, pointerTip } from '../../session/ui';
import { lit } from '../../render/lighting';
import type { Feature, Layer } from '../feature';
import { unpluggedTexture } from './art';
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
/** What the overlay lays over the ship, so the cables stand out from it. */
const DIM = { color: 0x05080d, alpha: 0.45 };
const REFRESH_MS = 250;

const stateColour = (n: PowerNetwork | undefined) =>
  !n ? LOOSE : n.satisfaction >= 1000 ? FED : n.satisfaction > 0 ? SHORT : DARK;

/** The cables as ropes, shared by the layer that draws them and the overlay that colours them. */
let ropes: CableRopes | undefined;

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

/**
 * Cables out of the overlay: thin ropes hanging between their nodes inside the ship, swinging out of
 * a hero's way, and drifting loose out in space (`./ropes`), drawn behind the ship's structure, so a
 * wall or a machine they pass is in front of them.
 */
function cables(): Layer {
  const lines = new Graphics();
  // Fittings sit on the hull's face, in front of the wall the cable goes behind.
  const fittings = new Graphics();
  for (const g of [lines, fittings]) lit(g);
  const own = createCableRopes();
  ropes = own;
  const sync = everyTick((sim) => own.sync(sim));
  return {
    view: fittings,
    behind: lines,
    update: ({ game, elapsedMs }) => {
      sync(game.client.sim, elapsedMs);
      own.update(elapsedMs, heroBodies.get());
      lines.clear();
      fittings.clear();
      const feeds = [];
      for (const line of own.lines()) {
        traceRope(lines, line.points, CELL);
        feeds.push(...line.feeds);
      }
      lines.stroke({ width: CABLE_WIDTH, color: CABLE, cap: 'round', join: 'round' });
      // A fitting on the wall where a cable goes through the hull.
      for (const f of feeds) fittings.circle(f.x * CELL, f.y * CELL, 2).fill(FITTING);
      for (const f of feeds) fittings.circle(f.x * CELL, f.y * CELL, 1).fill(CABLE);
    },
  };
}

/**
 * Power brought out of the ship: the ship dimmed, and every cable over it in its network's state,
 * the very ropes the cables hang as, glowing, a dot where each is plugged in; a plug hanging loose
 * over each machine that makes or draws power with no cable to it. Beside the pointer on a node,
 * what its network makes against what it would draw.
 */
function powerOverlay(): Layer {
  const view = new Container();
  const dim = new Graphics();
  const lines = new Graphics();
  const plugs = new Container();
  view.addChild(dim, lines, plugs);
  let byNode = new Map<number, PowerNetwork>();
  const redraw = everyTick((sim) => {
    const q = sim.query(grid);
    const wires = sim.query(power);
    byNode = new Map();
    for (const n of wires.networks()) for (const node of n.nodes) byNode.set(node, n);
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
      lines.clear();
      for (const { a, b, points } of ropes?.lines() ?? []) {
        const colour = stateColour(byNode.get(a) ?? byNode.get(b));
        traceRope(lines, points, CELL);
        lines.stroke({ width: 3, color: colour, alpha: 0.25, cap: 'round', join: 'round' });
        traceRope(lines, points, CELL);
        lines.stroke({ width: 1.25, color: colour, cap: 'round', join: 'round' });
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
