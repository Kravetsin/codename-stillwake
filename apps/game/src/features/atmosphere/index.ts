import { AIR, MACHINES } from '@stillwake/content';
import { atmosphere, grid, rooms } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { EFFECTS, particles } from '../../render/particles';
import type { Feature } from '../feature';
import { airOverlay, drawRooms } from './air-overlay';
import { draining } from './draining';
import { streamsOf, type Stream } from './streams';

const TRACK = 0x16212d;
const OXYGEN = 0x6fd3ff;
const BAR = 6;
const VENTING = 0xe03030;
/** Rooms are surveyed at most this often: a big ship has hundreds of them. */
const REFRESH_MS = 250;
/** One pulse of a venting room, in milliseconds of real time. */
const PULSE_MS = 900;

/**
 * The ship's air without a word: each tank's gauge up its right side, every room losing oxygen
 * into space pulsing red, and air streaming out through its openings while it holds any. Exact amounts are in the air overlay, on demand.
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
    let streams: Stream[] = [];
    /** Particles owed to each stream, carried over between frames. */
    let owed: number[] = [];
    return {
      view,
      update({ game, elapsedMs }) {
        const { sim } = game.client;
        clock += elapsedMs;
        pulse.alpha = 0.15 + 0.3 * (0.5 + 0.5 * Math.sin((clock / PULSE_MS) * 2 * Math.PI));
        streams.forEach((stream, i) => {
          const due = (owed[i] ?? 0) + (stream.perSecond * elapsedMs) / 1000;
          const count = Math.floor(due);
          owed[i] = due - count;
          // Anywhere across the opening; through a missing back wall, out every way.
          const at = {
            x: (stream.x + Math.random() - 0.5) * CELL,
            y: (stream.y + Math.random() - 0.5) * CELL,
          };
          const heading = stream.heading ?? Math.random() * 2 * Math.PI;
          particles.emit(EFFECTS.air, at, count, heading, true);
        });
        since += elapsedMs;
        if (since < REFRESH_MS) return;
        since = 0;
        const { width, height } = sim.query(grid).size();

        const air = sim.query(atmosphere).roomsAir();
        const where = sim.query(rooms);
        const byId = new Map(where.rooms().map((r) => [r.id, r.openings]));
        const next = streamsOf(
          air,
          (room) => byId.get(room) ?? [],
          width,
          height,
          (cell) => where.roomAt(cell) === 'space',
        );
        if (JSON.stringify(next) !== JSON.stringify(streams)) {
          streams = next;
          owed = [];
        }
        const losing = draining(air);
        // Redrawn while any room drains, since a room keeps its id as its cells change; cleared once.
        if (losing.size > 0 || drawnAny) {
          drawnAny = losing.size > 0;
          drawRooms(pulse, width, sim.query(rooms).roomOfCells(), (_cell, room) =>
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
