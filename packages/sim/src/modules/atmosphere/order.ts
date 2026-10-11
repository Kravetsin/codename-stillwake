import type { Room } from '../rooms';

/** Each room's cells in the order its air lies in, by room id. */
export type Orders = ReadonlyMap<number, Int32Array>;

/**
 * Every room's cells, breadth first through the room from the vents standing in it, in the order
 * `vents` lists them, or from its middle when it has none. Neighbours go up, left, right, down. A
 * room's air is always the start of its order: vents add the next cell, whatever uses air takes the
 * last ones.
 */
export function orderRooms(
  roomOf: Readonly<Int32Array>,
  width: number,
  rooms: readonly Room[],
  vents: readonly number[],
): Map<number, Int32Array> {
  const starts = new Map<number, number[]>();
  for (const cell of vents) {
    const room = roomOf[cell] ?? -1;
    if (room < 0) continue;
    const list = starts.get(room);
    if (list) list.push(cell);
    else starts.set(room, [cell]);
  }
  const ventless = rooms.filter((r) => !starts.has(r.id));
  const middles = ventless.length > 0 ? middlesOf(roomOf, width, ventless) : undefined;
  const seen = new Uint8Array(roomOf.length);
  const orders = new Map<number, Int32Array>();
  for (const room of rooms) {
    const order = new Int32Array(room.volume);
    let tail = 0;
    for (const cell of starts.get(room.id) ?? [middles?.get(room.id) ?? room.id]) {
      if (seen[cell]) continue;
      seen[cell] = 1;
      order[tail++] = cell;
    }
    const visit = (cell: number) => {
      if (seen[cell] || roomOf[cell] !== room.id) return;
      seen[cell] = 1;
      order[tail++] = cell;
    };
    for (let head = 0; head < tail; head++) {
      const cell = order[head] as number;
      if (cell >= width) visit(cell - width);
      if (cell % width !== 0) visit(cell - 1);
      if ((cell + 1) % width !== 0) visit(cell + 1);
      if (cell + width < roomOf.length) visit(cell + width);
    }
    if (tail !== room.volume) throw new Error(`Room ${room.id} is not connected.`);
    orders.set(room.id, order);
  }
  return orders;
}

/**
 * Each room's cell nearest the mean of its cells, counting steps along rows and columns; the
 * smallest such cell on a tie. The mean is rounded down.
 */
function middlesOf(
  roomOf: Readonly<Int32Array>,
  width: number,
  rooms: readonly Room[],
): Map<number, number> {
  const sums = new Map(rooms.map((r) => [r.id, { x: 0, y: 0, volume: r.volume }]));
  for (let cell = 0; cell < roomOf.length; cell++) {
    const sum = sums.get(roomOf[cell] ?? -1);
    if (!sum) continue;
    sum.x += cell % width;
    sum.y += Math.floor(cell / width);
  }
  const best = new Map<number, { cell: number; off: number }>();
  for (let cell = 0; cell < roomOf.length; cell++) {
    const room = roomOf[cell] ?? -1;
    const sum = sums.get(room);
    if (!sum) continue;
    const off =
      Math.abs((cell % width) - Math.floor(sum.x / sum.volume)) +
      Math.abs(Math.floor(cell / width) - Math.floor(sum.y / sum.volume));
    const held = best.get(room);
    if (!held || off < held.off) best.set(room, { cell, off });
  }
  return new Map([...best].map(([room, { cell }]) => [room, cell]));
}

/**
 * The rooms whose order may differ from the one found from `before` and `ventsBefore`: each room a
 * cell left or joined, as it was and as it is, and each room a vent came to or left. Ids that name
 * no room now are among them; nothing when nothing moved.
 */
export function changedRooms(
  before: Readonly<Int32Array>,
  roomOf: Readonly<Int32Array>,
  ventsBefore: readonly number[],
  vents: readonly number[],
): Set<number> {
  const changed = new Set<number>();
  const add = (room: number | undefined) => {
    if (room !== undefined && room >= 0) changed.add(room);
  };
  for (let cell = 0; cell < roomOf.length; cell++) {
    if (roomOf[cell] === before[cell]) continue;
    add(roomOf[cell]);
    add(before[cell]);
  }
  const was = new Set(ventsBefore);
  const now = new Set(vents);
  for (const cell of vents) if (!was.has(cell)) add(roomOf[cell]);
  for (const cell of ventsBefore) if (!now.has(cell)) add(roomOf[cell]);
  return changed;
}
