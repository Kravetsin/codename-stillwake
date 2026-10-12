import { grid, power, rooms } from '@stillwake/sim';
import { Graphics } from 'pixi.js';
import { hidden, shapeOf } from '../../render/cable';
import { CELL } from '../../render/camera';
import type { Feature } from '../feature';

const CABLE = 0x2b2f36;
const CABLE_EDGE = 0x8a9099;
const REFRESH_MS = 250;

/**
 * Power cables: hanging between their nodes inside the ship, straight out in space, and hidden
 * where they run through a wall or a closed door. Redrawn when the cables or the grid change.
 */
export const powerFeature: Feature = {
  id: 'power',
  layer() {
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
        const q = { grid: sim.query(grid), rooms: sim.query(rooms) };
        view.clear();
        for (const cable of sim.query(power).cables()) {
          const points = shapeOf(q, cable.a, cable.b);
          let drawing = false;
          for (let i = 1; i < points.length; i++) {
            const p = points[i - 1];
            const n = points[i];
            if (!p || !n) continue;
            if (hidden(q.grid, { x: (p.x + n.x) / 2, y: (p.y + n.y) / 2 })) {
              drawing = false;
              continue;
            }
            if (!drawing) view.moveTo(p.x * CELL, p.y * CELL);
            view.lineTo(n.x * CELL, n.y * CELL);
            drawing = true;
          }
        }
        // A pale edge under a dark core, so a cable reads on the dark hull and against space alike.
        view.stroke({ width: 4, color: CABLE_EDGE, alpha: 0.5, cap: 'round', join: 'round' });
        view.stroke({ width: 2, color: CABLE, cap: 'round', join: 'round' });
      },
    };
  },
};
