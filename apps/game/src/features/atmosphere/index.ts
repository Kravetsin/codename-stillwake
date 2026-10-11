import { AIR, MACHINES } from '@stillwake/content';
import { atmosphere, grid, rooms } from '@stillwake/sim';
import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CELL } from '../../render/camera';
import type { Feature } from '../feature';
import { airOverlay, drawRooms } from './air-overlay';
import { draining } from './draining';
import { lightOf } from './light';

const TRACK = 0x16212d;
const OXYGEN = 0x6fd3ff;
const BAR = 6;
const VENTING = 0xe03030;
/** Rooms are surveyed at most this often: a big ship has hundreds of them. */
const REFRESH_MS = 250;
/** One pulse of a venting room, in milliseconds of real time. */
const PULSE_MS = 900;
/** What the air adds to an aired cell: the room's own light, faint, over its dark interior. */
const GLOW = [22, 30, 40] as const;

/**
 * The ship's air without a word: light where there is air and twilight where there is none, each
 * tank's gauge up its right side, and every room losing oxygen into space pulsing red. Exact
 * amounts are in the air overlay, on demand.
 */
export const atmosphereFeature: Feature = {
  id: 'atmosphere',
  overlay: { name: 'overlay.air', key: 'KeyO', layer: airOverlay },
  layer() {
    // A pixel per cell, stretched smooth over the ship: the light multiplied over what is drawn
    // below, darkening rooms with no air; the glow added, lighting an aired room's empty cells.
    const light = new Sprite();
    light.blendMode = 'multiply';
    const glow = new Sprite();
    glow.blendMode = 'add';
    let lightSource: BufferImageSource | undefined;
    let glowSource: BufferImageSource | undefined;
    const pulse = new Graphics();
    const gauges = new Graphics();
    const view = new Container();
    view.addChild(light, glow, pulse, gauges);
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
        const { width, height } = sim.query(grid).size();

        if (
          !lightSource ||
          !glowSource ||
          lightSource.width !== width ||
          lightSource.height !== height
        ) {
          lightSource?.destroy();
          glowSource?.destroy();
          const source = () =>
            new BufferImageSource({
              resource: new Uint8Array(width * height * 4),
              width,
              height,
              scaleMode: 'linear',
            });
          lightSource = source();
          glowSource = source();
          light.texture = new Texture({ source: lightSource });
          glow.texture = new Texture({ source: glowSource });
          light.scale.set(CELL);
          glow.scale.set(CELL);
        }
        const roomOf = sim.query(rooms).roomOfCells();
        // A mask in one pass over the aired list, not a search of it for every cell.
        const mask = new Uint8Array(roomOf.length);
        for (const cell of sim.query(atmosphere).airedCells()) mask[cell] = 1;
        const airedAt = (cell: number) => mask[cell] === 1;
        const lit = lightOf(width, roomOf, airedAt);
        const shade = lightSource.resource as Uint8Array;
        const added = glowSource.resource as Uint8Array;
        for (let cell = 0; cell < lit.length; cell++) {
          const level = lit[cell] ?? 255;
          const glowing = (roomOf[cell] ?? -1) >= 0 && airedAt(cell);
          for (let c = 0; c < 3; c++) {
            shade[cell * 4 + c] = level;
            added[cell * 4 + c] = glowing ? (GLOW[c] ?? 0) : 0;
          }
          shade[cell * 4 + 3] = 255;
          added[cell * 4 + 3] = 255;
        }
        lightSource.update();
        glowSource.update();

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
