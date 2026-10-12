import { MACHINES, type MachineSpec } from '@stillwake/content';
import { grid, power, rooms, type PowerNetwork, type Sim } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { t } from '../../i18n/en';
import { middleOf, shapeOf, type Point } from '../../render/cable';
import { CELL } from '../../render/camera';
import { pointerTip } from '../../session/ui';
import type { Feature, Layer } from '../feature';

/** A cable out of the overlay: thin and dark, a line against the back wall. */
const CABLE = 0x7c8794;
const CABLE_WIDTH = 1.25;
/** In the overlay, cables and nodes by their network's state: fed in full, short, dark. */
const FED = 0x7fe08a;
const SHORT = 0xf0b44c;
const DARK = 0xe05555;
/** A machine making or drawing power with no cable to it. */
const LOOSE = 0x9aa3ad;
const OVERLAY_WIDTH = 2.5;
const REFRESH_MS = 250;

const stateColour = (n: PowerNetwork | undefined) =>
  !n ? LOOSE : n.satisfaction >= 1000 ? FED : n.satisfaction > 0 ? SHORT : DARK;

function strokeCable(g: Graphics, points: readonly Point[]) {
  points.forEach((p, i) =>
    i === 0 ? g.moveTo(p.x * CELL, p.y * CELL) : g.lineTo(p.x * CELL, p.y * CELL),
  );
}

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
 * Cables out of the overlay: thin lines hanging between their nodes inside the ship and taut out in
 * space, drawn behind the ship's structure, so a wall or a machine they pass is in front of them.
 */
function cables(): Layer {
  const lines = new Graphics();
  const redraw = everyTick((sim) => {
    const q = { grid: sim.query(grid), rooms: sim.query(rooms) };
    lines.clear();
    for (const c of sim.query(power).cables()) strokeCable(lines, shapeOf(q, c.a, c.b));
    lines.stroke({ width: CABLE_WIDTH, color: CABLE, cap: 'round', join: 'round' });
  });
  return {
    view: new Container(),
    behind: lines,
    update: ({ game, elapsedMs }) => redraw(game.client.sim, elapsedMs),
  };
}

/**
 * Power brought in front of the ship: every cable coloured by how its network stands, every node
 * and anchor ringed the same, a machine on no network in grey; beside the pointer on a node, what
 * its network makes against what it would draw.
 */
function powerOverlay(): Layer {
  const view = new Graphics();
  const redraw = everyTick((sim) => {
    const q = { grid: sim.query(grid), rooms: sim.query(rooms) };
    const wires = sim.query(power);
    view.clear();
    const byNode = new Map<number, PowerNetwork>();
    for (const n of wires.networks()) for (const node of n.nodes) byNode.set(node, n);
    for (const c of wires.cables()) {
      strokeCable(view, shapeOf(q, c.a, c.b));
      view.stroke({ width: OVERLAY_WIDTH, color: stateColour(byNode.get(c.a)), cap: 'round' });
    }
    const ring = (node: number, colour: number) => {
      const m = middleOf(q.grid, node);
      view.circle(m.x * CELL, m.y * CELL, CELL * 0.3).stroke({ width: 2, color: colour });
    };
    for (const [node, n] of byNode) ring(node, stateColour(n));
    for (const m of q.grid.machines()) {
      const spec: MachineSpec = MACHINES[m.kind];
      const powered = spec.makes !== undefined || spec.draws !== undefined;
      if (powered && !byNode.has(m.cell)) ring(m.cell, LOOSE);
    }
  });
  return {
    view,
    update({ game, camera, elapsedMs }) {
      const { sim } = game.client;
      redraw(sim, elapsedMs);
      const pointer = camera.pointer();
      const { width, height } = sim.query(grid).size();
      const x = pointer ? Math.floor(pointer.x) : -1;
      const y = pointer ? Math.floor(pointer.y) : -1;
      const onGrid = x >= 0 && y >= 0 && x < width && y < height;
      const node = onGrid ? sim.query(power).nodeAt(y * width + x) : undefined;
      const network = node === undefined ? undefined : sim.query(power).networkOf(node);
      const lines = network
        ? [t('power.supply', { supply: network.supply, demand: network.demand })]
        : [];
      // Told only when it changes, as the air overlay does: the tip is React's.
      if (lines.join('\n') !== (pointerTip.get().world ?? []).join('\n')) {
        pointerTip.set({ ...pointerTip.get(), world: lines.length > 0 ? lines : undefined });
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
