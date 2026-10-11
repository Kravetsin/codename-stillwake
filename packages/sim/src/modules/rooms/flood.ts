/** What `roomOf` holds for a cell outside every room: open to space, or solid. */
export const SPACE = -1;
export const SOLID = -2;
const UNSEEN = -3;
/** A side past the grid's edge, among a cell's neighbours. */
const EDGE = -1;

export interface Room {
  /** Its smallest cell. */
  readonly id: number;
  /** How many cells it holds. */
  readonly volume: number;
  /** Solid cells next to it and to space or the grid's edge, in cell order: what it leaks through. */
  readonly hull: readonly number[];
  /**
   * Its cells that touch space or the grid's edge, or have no back wall, in cell order: what it
   * vents through.
   */
  readonly openings: readonly number[];
}

export interface Walls {
  readonly width: number;
  readonly height: number;
  readonly structure: readonly number[];
  /** The structure codes air cannot pass: walls and closed doors. */
  readonly solid: readonly number[];
  /** The code of an open door, which is always an opening. */
  readonly doorOpen: number;
  /** Per cell, whether a back wall closes it behind: a room cell without one is an opening. */
  readonly back: readonly number[];
  readonly backWall: number;
}

/**
 * Splits the grid into space and rooms. An open cell is an opening when it sits in a wall line: an
 * open door, or a cell with solid cells on both sides or both above and below. Space is a flood from
 * the open cells on the grid's border through open cells that are not openings; a room is a
 * component of the open cells left, openings included. A room cell with no back wall is open to
 * space behind, so an opening too: found after the flood, as space has no back walls. Typed arrays
 * and no allocation per cell: on the reference world this runs on every door toggle.
 */
export function findRooms(walls: Walls): { roomOf: Int32Array; rooms: Room[] } {
  const { width, height, structure } = walls;
  const size = width * height;
  const solid = new Uint8Array(size);
  for (let cell = 0; cell < size; cell++) {
    if (walls.solid.includes(structure[cell] ?? -1)) solid[cell] = 1;
  }
  const opening = new Uint8Array(size);
  for (let cell = 0; cell < size; cell++) {
    if (solid[cell]) continue;
    const x = cell % width;
    const across = x > 0 && x < width - 1 && solid[cell - 1] && solid[cell + 1];
    const down = cell >= width && cell + width < size && solid[cell - width] && solid[cell + width];
    if (structure[cell] === walls.doorOpen || across || down) opening[cell] = 1;
  }
  // The four neighbours of a cell, written into `near`, with EDGE for a side past the grid.
  const near = new Int32Array(4);
  const neighbours = (cell: number) => {
    const x = cell % width;
    near[0] = x > 0 ? cell - 1 : EDGE;
    near[1] = x < width - 1 ? cell + 1 : EDGE;
    near[2] = cell >= width ? cell - width : EDGE;
    near[3] = cell + width < size ? cell + width : EDGE;
  };

  const roomOf = new Int32Array(size);
  for (let cell = 0; cell < size; cell++) roomOf[cell] = solid[cell] ? SOLID : UNSEEN;

  // Space: from the border, never through an opening.
  const queue = new Int32Array(size);
  let tail = 0;
  for (let cell = 0; cell < size; cell++) {
    const x = cell % width;
    const border = x === 0 || x === width - 1 || cell < width || cell >= size - width;
    if (border && roomOf[cell] === UNSEEN && !opening[cell]) {
      roomOf[cell] = SPACE;
      queue[tail++] = cell;
    }
  }
  for (let head = 0; head < tail; head++) {
    neighbours(queue[head] as number);
    for (let i = 0; i < 4; i++) {
      const next = near[i] as number;
      if (next !== EDGE && roomOf[next] === UNSEEN && !opening[next]) {
        roomOf[next] = SPACE;
        queue[tail++] = next;
      }
    }
  }

  // Rooms: what is left, found in cell order, so each is named by its smallest cell.
  const rooms: Room[] = [];
  const index = new Map<number, number>();
  for (let start = 0; start < size; start++) {
    if (roomOf[start] !== UNSEEN) continue;
    let count = 0;
    roomOf[start] = start;
    queue[count++] = start;
    for (let head = 0; head < count; head++) {
      neighbours(queue[head] as number);
      for (let i = 0; i < 4; i++) {
        const next = near[i] as number;
        if (next !== EDGE && roomOf[next] === UNSEEN) {
          roomOf[next] = start;
          queue[count++] = next;
        }
      }
    }
    index.set(start, rooms.length);
    rooms.push({ id: start, volume: count, hull: [], openings: [] });
  }

  // Openings and hull in one pass in cell order, so both come out sorted.
  for (let cell = 0; cell < size; cell++) {
    const here = roomOf[cell] as number;
    if (here === SPACE) continue;
    const outside = outsideOf(roomOf, width, cell);
    if (here !== SOLID) {
      if (outside || walls.back[cell] !== walls.backWall) {
        (rooms[index.get(here) as number]?.openings as number[]).push(cell);
      }
      continue;
    }
    if (!outside) continue;
    // A solid cell with the outside beyond it is hull to every room it borders, once each.
    neighbours(cell);
    for (let i = 0; i < 4; i++) {
      const n = near[i] as number;
      const id = n === EDGE ? SPACE : (roomOf[n] as number);
      if (id < 0) continue;
      let seen = false;
      for (let j = 0; j < i; j++) {
        const m = near[j] as number;
        if (m !== EDGE && roomOf[m] === id) seen = true;
      }
      if (!seen) (rooms[index.get(id) as number]?.hull as number[]).push(cell);
    }
  }
  return { roomOf, rooms };
}

/** Whether `cell` has space or the grid's edge beside it. */
function outsideOf(roomOf: Int32Array, width: number, cell: number): boolean {
  const x = cell % width;
  if (x === 0 || x === width - 1 || cell < width || cell >= roomOf.length - width) return true;
  return (
    roomOf[cell - 1] === SPACE ||
    roomOf[cell + 1] === SPACE ||
    roomOf[cell - width] === SPACE ||
    roomOf[cell + width] === SPACE
  );
}

/**
 * `rooms` with their openings found again for a new back layer, when nothing else changed: back
 * walls never move a room's bounds, so the flood and the hull stand. A pass over the cells, with
 * none of the flood's queues: on the reference world it saves most of a rebuild.
 */
export function reopen(
  roomOf: Int32Array,
  rooms: readonly Room[],
  width: number,
  back: readonly number[],
  backWall: number,
): Room[] {
  const openings = new Map<number, number[]>();
  for (const room of rooms) openings.set(room.id, []);
  for (let cell = 0; cell < roomOf.length; cell++) {
    const id = roomOf[cell] as number;
    if (id < 0) continue;
    if (back[cell] !== backWall || outsideOf(roomOf, width, cell)) openings.get(id)?.push(cell);
  }
  return rooms.map((room) => ({ ...room, openings: openings.get(room.id) ?? [] }));
}
