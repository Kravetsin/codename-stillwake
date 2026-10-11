import { atmosphere, grid, rooms, type RoomAir, type RoomStatus } from '@stillwake/sim';
import { Container, Graphics, Text } from 'pixi.js';
import { CELL } from '../../render/camera';
import type { Layer } from '../feature';
import { explain } from './explain';

const TINT: Record<RoomStatus, number> = {
  aired: 0x3fc7a0,
  filling: 0xe0c040,
  venting: 0xe05050,
  vacuum: 0x6a7488,
};
/** The whole ship's air is surveyed at most this often: a big ship has hundreds of rooms. */
const REFRESH_MS = 250;

/**
 * Rooms tinted by the state of their air, and under the pointer what the sim says of that room's
 * air: what it leaks, what holds it up and for how long, or what it lacks.
 */
export function airOverlay(): Layer {
  const tint = new Graphics();
  tint.alpha = 0.35;
  const tip = new Text({
    text: '',
    style: {
      fontFamily: 'monospace',
      fontSize: 9,
      fill: 0xf2f5fa,
      stroke: { color: 0x0b0f17, width: 3 },
      lineHeight: 11,
    },
  });
  const view = new Container();
  view.addChild(tint, tip);
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
        drawRooms(tint, sim.query(grid).size().width, sim.query(rooms).roomOfCells(), (room) => {
          const air = byRoom.get(room);
          return air && TINT[air.status];
        });
      }
      const pointer = camera.pointer();
      const room = pointer && sim.query(rooms).roomAt(cellAt(sim.query(grid).size(), pointer));
      const air = typeof room === 'number' ? byRoom.get(room) : undefined;
      const volume = air && sim.query(rooms).room(air.room)?.volume;
      tip.text = air && volume !== undefined ? explain(air, volume).join('\n') : '';
      if (pointer) tip.position.set(pointer.x * CELL + 12, pointer.y * CELL + 12);
    },
  };
}

function cellAt(size: { width: number; height: number }, p: { x: number; y: number }): number {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  return x < 0 || y < 0 || x >= size.width || y >= size.height ? -1 : y * size.width + x;
}

/**
 * Rooms' cells in the colour `colourOf` gives each room, none for a room it leaves out: a rectangle
 * per run of a room along a row, one fill per colour.
 */
export function drawRooms(
  g: Graphics,
  width: number,
  roomOf: Readonly<Int32Array>,
  colourOf: (room: number) => number | undefined,
): void {
  g.clear();
  const runs = new Map<number, [start: number, length: number][]>();
  for (let start = 0; start < roomOf.length;) {
    const room = roomOf[start] ?? -1;
    let end = start + 1;
    while (end < roomOf.length && end % width !== 0 && roomOf[end] === room) end++;
    const colour = room >= 0 ? colourOf(room) : undefined;
    if (colour !== undefined) {
      const list = runs.get(colour) ?? [];
      list.push([start, end - start]);
      runs.set(colour, list);
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
