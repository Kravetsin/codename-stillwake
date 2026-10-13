import type { RoomAir } from '@stillwake/sim';

/**
 * Where air streams out of a room: the middle of an opening, in cells, and the heading toward the
 * space beside it, in radians screen-wise; none where it leaves through a missing back wall.
 * `perSecond` is how thick the stream is.
 */
export interface Stream {
  readonly x: number;
  readonly y: number;
  readonly heading: number | undefined;
  readonly perSecond: number;
}

/** How thick one opening's stream is, and the most a room gives off through all of them. */
export const STREAM = { perOpening: 24, perRoom: 160 };

/**
 * The streams of every room venting air into space while it still holds some, or its vents still
 * pour oxygen in, from tanks or a generator: one per opening, heading out into the space beside it,
 * thinner the more openings a room has. A room open to space with no air and nothing pouring in is
 * quiet.
 */
export function streamsOf(
  air: readonly RoomAir[],
  openingsOf: (room: number) => readonly number[],
  width: number,
  height: number,
  isSpace: (cell: number) => boolean,
): Stream[] {
  const streams: Stream[] = [];
  for (const room of air) {
    const pouring = room.lasts !== undefined || room.made > 0;
    if (room.status !== 'venting' || (room.aired === 0 && !pouring)) continue;
    const openings = openingsOf(room.room);
    const perSecond = Math.min(STREAM.perOpening, STREAM.perRoom / Math.max(1, openings.length));
    for (const cell of openings) {
      const x = cell % width;
      const y = Math.floor(cell / width);
      let dx = 0;
      let dy = 0;
      for (const [nx, ny] of [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ] as const) {
        const ax = x + nx;
        const ay = y + ny;
        const out = ax < 0 || ay < 0 || ax >= width || ay >= height || isSpace(ay * width + ax);
        if (out) {
          dx += nx;
          dy += ny;
        }
      }
      const heading = dx === 0 && dy === 0 ? undefined : Math.atan2(dy, dx);
      streams.push({ x: x + 0.5, y: y + 0.5, heading, perSecond });
    }
  }
  return streams;
}
