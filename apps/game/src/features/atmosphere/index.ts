import { AIR, MACHINES } from '@stillwake/content';
import { atmosphere, grid, rooms } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import type { Feature } from '../feature';
import { airOverlay, drawRooms } from './air-overlay';
import { draining } from './draining';

const TRACK = 0x16212d;
const OXYGEN = 0x6fd3ff;
const BAR = 6;
const VENTING = 0xe03030;
/** Rooms are surveyed at most this often: a big ship has hundreds of them. */
const REFRESH_MS = 250;
/** One pulse of a venting room, in milliseconds of real time. */
const PULSE_MS = 900;

/**
 * The ship's air without a word: each tank's gauge up its right side, and every room losing oxygen
 * into space pulsing red. Exact amounts are in the air overlay, on demand.
 */
export const atmosphereFeature: Feature = {
  id: 'atmosphere',
  overlay: { name: 'overlay.air', key: 'KeyO', layer: airOverlay },
  layer() {
    const pulse = new Graphics();
    const gauges = new Graphics();
    const view = new Container();
    view.addChild(pulse, gauges);
    let since = Infinity;
    let clock = 0;
    let shownTanks = '';
    let drawnAny = false;
    return {
      view,
      update({ game, elapsedMs }) {
        const { sim } = game.client;
        clock += elapsedMs;
        pulse.alpha = 0.15 + 0.3 * (0.5 + 0.5 * Math.sin((clock / PULSE_MS) * 2 * Math.PI));
        since += elapsedMs;
        if (since < REFRESH_MS) return;
        since = 0;
        const { width } = sim.query(grid).size();

        const losing = draining(sim.query(atmosphere).roomsAir());
        // Redrawn while any room drains, since a room keeps its id as its cells change; cleared once.
        if (losing.size > 0 || drawnAny) {
          drawnAny = losing.size > 0;
          drawRooms(pulse, width, sim.query(rooms).roomOfCells(), (room) =>
            losing.has(room) ? VENTING : undefined,
          );
        }

        const tanks = sim
          .query(grid)
          .machines()
          .filter((m) => m.kind === 'tank')
          .map((m) => ({ cell: m.cell, oxygen: sim.query(atmosphere).oxygenIn(m.id) }));
        const tanksKey = tanks.map((t) => `${t.cell}:${t.oxygen}`).join(',');
        if (tanksKey === shownTanks) return;
        shownTanks = tanksKey;
        gauges.clear();
        const { width: across, height: tall } = MACHINES.tank;
        const full = tall * CELL - 8;
        for (const { cell, oxygen } of tanks) {
          const x = (cell % width) * CELL + across * CELL - BAR - 4;
          const top = Math.floor(cell / width) * CELL + 4;
          const level = Math.round((full * oxygen) / AIR.tankCapacity);
          gauges.rect(x, top, BAR, full).fill(TRACK);
          if (level > 0) gauges.rect(x, top + full - level, BAR, level).fill(OXYGEN);
        }
      },
    };
  },
};
