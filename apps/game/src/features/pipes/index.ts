import { CONDUIT, grid, pipes } from '@stillwake/sim';
import { Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import type { Feature, Layer } from '../feature';
import { NetworkOxygen } from './NetworkOxygen';
import { colourOf } from './oxygen';

const VALVE_OPEN = 0x4caf6a;
const VALVE_CLOSED = 0xd05050;
const REFRESH_MS = 250;

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

/** The oxygen on each network, and an overlay of them all; the grid draws the pipes themselves. */
export const pipesFeature: Feature = {
  id: 'pipes',
  Panel: NetworkOxygen,
  overlay: { name: 'overlay.pipes', key: 'KeyP', layer: pipesOverlay },
};
