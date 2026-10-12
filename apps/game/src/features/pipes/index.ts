import { atmosphere, CONDUIT, grid, pipes, power } from '@stillwake/sim';
import { Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import type { Feature, Layer } from '../feature';
import { colourOf, litNetworks } from './oxygen';

const VALVE_OPEN = 0x4caf6a;
const VALVE_CLOSED = 0xd05050;
const REFRESH_MS = 250;
/** How a network without oxygen in it is drawn, against one with: faded. */
const DRY_ALPHA = 0.4;

/**
 * Every pipe network brought in front of the ship, each in a colour of its own, so a player sees
 * which tanks and generators reach which vents: full where oxygen is in it, faded where none is. Each
 * valve ringed by its state: a closed one is where two networks meet without joining. Out of the
 * overlay, the grid draws the pipes dull, behind walls and machines.
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
      const { width } = cells;
      const kinds = new Map(
        sim
          .query(grid)
          .machines()
          .map((m) => [m.id, m.kind]),
      );
      // A tank holding oxygen feeds its pipes; a powered generator does, its store empty or not.
      const lit = new Set(
        litNetworks(sim.query(pipes).networks(), (m) =>
          kinds.get(m) === 'generator'
            ? sim.query(power).satisfaction(m) > 0
            : kinds.get(m) === 'tank' && sim.query(atmosphere).oxygenIn(m) > 0,
        ),
      );
      view.clear();
      sim
        .query(pipes)
        .networks()
        .forEach((network, i) => {
          const own = new Set(network.cells);
          // Drawn as a pipe is, reaching toward the neighbours of its own network.
          for (const cell of network.cells) {
            const cx = (cell % width) * CELL + CELL / 2;
            const cy = Math.floor(cell / width) * CELL + CELL / 2;
            view.rect(cx - 3, cy - 3, 6, 6);
            const x = cell % width;
            if (x < width - 1 && own.has(cell + 1)) view.rect(cx, cy - 3, CELL / 2, 6);
            if (x > 0 && own.has(cell - 1)) view.rect(cx - CELL / 2, cy - 3, CELL / 2, 6);
            if (own.has(cell + width)) view.rect(cx - 3, cy, 6, CELL / 2);
            if (own.has(cell - width)) view.rect(cx - 3, cy - CELL / 2, 6, CELL / 2);
          }
          view.fill({ color: colourOf(i), alpha: lit.has(network) ? 1 : DRY_ALPHA });
        });
      for (const [state, colour] of [
        [CONDUIT.valveOpen, VALVE_OPEN],
        [CONDUIT.valveClosed, VALVE_CLOSED],
      ] as const) {
        cells.conduit.forEach((c, cell) => {
          if (c !== state) return;
          const x = (cell % width) * CELL;
          const y = Math.floor(cell / width) * CELL;
          view.rect(x + 1, y + 1, CELL - 2, CELL - 2);
        });
        view.stroke({ width: 2, color: colour });
      }
    },
  };
}

/** An overlay of every pipe network and where oxygen is in it; the grid draws the pipes themselves. */
export const pipesFeature: Feature = {
  id: 'pipes',
  overlay: { name: 'overlay.pipes', key: 'KeyP', layer: pipesOverlay },
};
