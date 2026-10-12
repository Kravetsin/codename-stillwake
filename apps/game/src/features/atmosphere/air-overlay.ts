import { atmosphere, crew, grid, rooms, type RoomAir } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { pointerTip } from '../../session/ui';
import type { Layer } from '../feature';
import { explain } from './explain';

/** A cell holding air. */
const AIRED = 0x3fc7a0;
/** A room's cell with none. */
const EMPTY = 0x6a7488;
/** Every cell of a room open to space, whose air is gone. */
const VENTING = 0xe05050;
/** The whole ship's air is surveyed at most this often: a big ship has hundreds of rooms. */
const REFRESH_MS = 250;

/**
 * The ship's air, cell by cell, as a view of its own: each cell holding air coloured, each room cell
 * without it grey, a room open to space red; a filling room fills in before the eyes. Under the
 * pointer, beside it (`pointerTip`), what the sim says of that room's air: what holds it up and for
 * how long, or what it lacks.
 */
export function airOverlay(): Layer {
  const tint = new Graphics();
  tint.alpha = 0.35;
  const view = new Container();
  view.addChild(tint);
  let since = Infinity;
  let byRoom = new Map<number, RoomAir>();

  return {
    view,
    update({ game, camera, elapsedMs }) {
      const { sim } = game.client;
      since += elapsedMs;
      if (since >= REFRESH_MS) {
        since = 0;
        byRoom = new Map(
          sim
            .query(atmosphere)
            .roomsAir()
            .map((air) => [air.room, air]),
        );
        const mask = new Uint8Array(sim.query(rooms).roomOfCells().length);
        for (const cell of sim.query(atmosphere).airedCells()) mask[cell] = 1;
        drawRooms(
          tint,
          sim.query(grid).size().width,
          sim.query(rooms).roomOfCells(),
          (cell, room) =>
            byRoom.get(room)?.status === 'venting' ? VENTING : mask[cell] === 1 ? AIRED : EMPTY,
        );
      }
      const pointer = camera.pointer();
      const room = pointer && sim.query(rooms).roomAt(cellAt(sim.query(grid).size(), pointer));
      const air = typeof room === 'number' ? byRoom.get(room) : undefined;
      const volume = air && sim.query(rooms).room(air.room)?.volume;
      // Heroes awake in the room breathe its air: the forecast counts them.
      const breathers =
        air === undefined
          ? 0
          : sim
              .query(crew)
              .heroes()
              .filter((h) => h.out === 0 && sim.query(rooms).roomAt(h.cell) === air.room).length;
      const lines = air && volume !== undefined ? explain(air, volume, breathers) : [];
      // Told only when it changes: the tip is React's, and a word every frame would cost. Read back
      // from the tip, which the overlay switched off and on again finds cleared.
      if (lines.join('\n') !== (pointerTip.get().world ?? []).join('\n')) {
        pointerTip.set({ ...pointerTip.get(), world: lines.length > 0 ? lines : undefined });
      }
    },
  };
}

function cellAt(size: { width: number; height: number }, p: { x: number; y: number }): number {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  return x < 0 || y < 0 || x >= size.width || y >= size.height ? -1 : y * size.width + x;
}

/**
 * Rooms' cells in the colour `colourOf` gives each cell of a room, none where it gives none: a
 * rectangle per run of one colour along a row, one fill per colour.
 */
export function drawRooms(
  g: Graphics,
  width: number,
  roomOf: Readonly<Int32Array>,
  colourOf: (cell: number, room: number) => number | undefined,
): void {
  g.clear();
  const colour = (cell: number) => {
    const room = roomOf[cell] ?? -1;
    return room >= 0 ? colourOf(cell, room) : undefined;
  };
  const runs = new Map<number, [start: number, length: number][]>();
  for (let start = 0; start < roomOf.length;) {
    const here = colour(start);
    let end = start + 1;
    while (end < roomOf.length && end % width !== 0 && colour(end) === here) end++;
    if (here !== undefined) {
      const list = runs.get(here) ?? [];
      list.push([start, end - start]);
      runs.set(here, list);
    }
    start = end;
  }
  for (const [colour, list] of runs) {
    for (const [start, length] of list) {
      g.rect((start % width) * CELL, Math.floor(start / width) * CELL, length * CELL, CELL);
    }
    g.fill(colour);
  }
}
