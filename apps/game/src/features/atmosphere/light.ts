import { SPACE } from '@stillwake/sim';

/** Full light, as a byte. */
export const LIT = 255;
/** A room with no air, in twilight: dark, but light enough to build in. */
export const DARK = 90;

/**
 * The light of every cell, a byte each: an aired cell is lit and a room's other cells are dark;
 * space is left as it is; a solid cell (a wall, a closed door) takes the brightest room among its
 * eight neighbours, corners included, so a dark room's walls are dark all round, and one with no
 * room beside it, deep in a thick hull, is left lit.
 */
export function lightOf(
  width: number,
  roomOf: Readonly<Int32Array>,
  aired: (cell: number) => boolean,
): Uint8Array {
  const light = new Uint8Array(roomOf.length).fill(LIT);
  const inRoom = (cell: number) => (roomOf[cell] ?? -1) >= 0;
  for (let cell = 0; cell < roomOf.length; cell++) {
    if (inRoom(cell)) light[cell] = aired(cell) ? LIT : DARK;
  }
  for (let cell = 0; cell < roomOf.length; cell++) {
    if (inRoom(cell) || roomOf[cell] === SPACE) continue;
    const x = cell % width;
    let brightest = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 0 || x + dx >= width) continue;
        const n = cell + dy * width + dx;
        if (inRoom(n)) brightest = Math.max(brightest, light[n] ?? LIT);
      }
    }
    if (brightest >= 0) light[cell] = brightest;
  }
  return light;
}
