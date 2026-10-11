import { atmosphere, CONDUIT, grid, pipes } from '@stillwake/sim';
import { Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import type { Feature, Layer } from '../feature';
import { colourOf, litNetworks } from './oxygen';

const VALVE_OPEN = 0x4caf6a;
const VALVE_CLOSED = 0xd05050;
const REFRESH_MS = 250;
/** The colour of a pipe with oxygen in it; the grid draws every pipe dull beneath. */
const LIT = 0x3fa7d6;

/**
 * Pipes carrying oxygen, lit over the grid's dull ones: a run that stays dull holds none. Drawn as the
 * grid draws a pipe, reaching toward the neighbours of its own network.
 */
function litPipes(): Layer {
  const view = new Graphics();
  let since = Infinity;
  let shown = '';
  return {
    view,
    update({ game, elapsedMs }) {
      since += elapsedMs;
      if (since < REFRESH_MS) return;
      since = 0;
      const { sim } = game.client;
      const { width } = sim.query(grid).size();
      const tanks = new Set(
        sim
          .query(grid)
          .machines()
          .filter((m) => m.kind === 'tank')
          .map((m) => m.id),
      );
      const lit = litNetworks(
        sim.query(pipes).networks(),
        (m) => tanks.has(m),
        (tank) => sim.query(atmosphere).oxygenIn(tank),
      );
      const key = lit.map((n) => n.cells.join(',')).join('|');
      if (key === shown) return;
      shown = key;
      view.clear();
      for (const network of lit) {
        const cells = new Set(network.cells);
        for (const cell of network.cells) {
          const cx = (cell % width) * CELL + CELL / 2;
          const cy = Math.floor(cell / width) * CELL + CELL / 2;
          view.rect(cx - 2, cy - 2, 4, 4);
          const x = cell % width;
          if (x < width - 1 && cells.has(cell + 1)) view.rect(cx, cy - 2, CELL / 2, 4);
          if (x > 0 && cells.has(cell - 1)) view.rect(cx - CELL / 2, cy - 2, CELL / 2, 4);
          if (cells.has(cell + width)) view.rect(cx - 2, cy, 4, CELL / 2);
          if (cells.has(cell - width)) view.rect(cx - 2, cy - CELL / 2, 4, CELL / 2);
        }
      }
      view.fill(LIT);
    },
  };
}

/**
 * Every pipe network in a colour of its own, so a player sees which tanks reach which vents, and each
 * valve ringed by its state: a closed one is where two networks meet without joining.
 */
function pipesOverlay(): Layer {
  const view = new Graphics();
  let since = Infinity;
  let shown = -1;
  return {
    view,
    update({ game, elapsedMs }) {
      const { sim } = game.client;
      since += elapsedMs;
      if (since < REFRESH_MS || sim.world.tick === shown) return;
      since = 0;
      shown = sim.world.tick;
      const cells = sim.query(grid).layers();
      const at = (cell: number) => [
        (cell % cells.width) * CELL,
        Math.floor(cell / cells.width) * CELL,
      ];
      view.clear();
      sim
        .query(pipes)
        .networks()
        .forEach((network, i) => {
          for (const cell of network.cells) {
            const [x, y] = at(cell) as [number, number];
            view.rect(x + 3, y + 3, CELL - 6, CELL - 6);
          }
          view.fill(colourOf(i));
        });
      for (const [state, colour] of [
        [CONDUIT.valveOpen, VALVE_OPEN],
        [CONDUIT.valveClosed, VALVE_CLOSED],
      ] as const) {
        cells.conduit.forEach((c, cell) => {
          if (c !== state) return;
          const [x, y] = at(cell) as [number, number];
          view.rect(x + 1, y + 1, CELL - 2, CELL - 2);
        });
        view.stroke({ width: 2, color: colour });
      }
    },
  };
}

/** Which pipes carry oxygen, and an overlay of every network; the grid draws the pipes themselves. */
export const pipesFeature: Feature = {
  id: 'pipes',
  layer: litPipes,
  overlay: { name: 'overlay.pipes', key: 'KeyP', layer: pipesOverlay },
};
