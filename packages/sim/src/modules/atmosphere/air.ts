import { AIR, MATERIALS } from '@stillwake/content';
import type { DeepReadonly, QueryApi } from '../../core/module';
import type { GridModule } from '../grid';
import type { PipesModule } from '../pipes';
import type { Room, RoomsModule } from '../rooms';

export type RoomStatus = 'vacuum' | 'filling' | 'aired' | 'venting';

/** The oxygen a tank holds, by machine id; the aired cells, sorted. */
export interface Air {
  tanks: { tank: number; oxygen: number }[];
  aired: number[];
}

type Seen = DeepReadonly<Air>;

export interface World {
  readonly grid: QueryApi<GridModule>;
  readonly rooms: QueryApi<RoomsModule>;
  readonly pipes: QueryApi<PipesModule>;
}

/**
 * Who is where, gathered in one pass over the machines and the aired cells, so the rules below read
 * maps instead of scanning the ship once per room: the reference world has hundreds of rooms.
 */
interface Survey {
  /** The networks of the vents standing in each room, or in space, in vent id order. */
  readonly ventsIn: Map<number | 'space', number[]>;
  /** The tanks on each network, in id order. */
  readonly tanksOn: Map<number, number[]>;
  /** How many cells of each room are aired, by room id: rooms are named by cells. */
  readonly airedIn: Int32Array;
  /** Each tank holding oxygen, by id: the very entries of `Air.tanks`. */
  readonly held: Map<number, { readonly tank: number; oxygen: number }>;
}

function survey(air: Seen, world: World): Survey {
  const ventsIn = new Map<number | 'space', number[]>();
  const tanksOn = new Map<number, number[]>();
  for (const m of world.grid.machines()) {
    if (m.kind !== 'vent' && m.kind !== 'tank') continue;
    for (const port of world.grid.portsOf(m)) {
      const network = world.pipes.networkAt(port);
      if (network === undefined) continue;
      if (m.kind === 'tank') {
        const tanks = tanksOn.get(network);
        if (tanks) tanks.push(m.id);
        else tanksOn.set(network, [m.id]);
        continue;
      }
      const place = world.rooms.roomAt(m.cell);
      if (place === undefined) continue;
      const vents = ventsIn.get(place);
      if (vents) vents.push(network);
      else ventsIn.set(place, [network]);
    }
  }
  const roomOf = world.rooms.roomOfCells();
  const airedIn = new Int32Array(roomOf.length);
  for (const cell of air.aired) {
    const room = roomOf[cell] ?? -1;
    if (room >= 0) airedIn[room] = (airedIn[room] ?? 0) + 1;
  }
  const held = new Map(air.tanks.map((t) => [t.tank, t as { tank: number; oxygen: number }]));
  return { ventsIn, tanksOn, airedIn, held };
}

export function oxygenIn(air: Seen, tank: number): number {
  return air.tanks.find((t) => t.tank === tank)?.oxygen ?? 0;
}

/** Whether `cell` is in the sorted `cells`. */
export function holds(cells: readonly number[], cell: number): boolean {
  let lo = 0;
  let hi = cells.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const at = cells[mid] as number;
    if (at === cell) return true;
    if (at < cell) lo = mid + 1;
    else hi = mid;
  }
  return false;
}

/** Two sorted lists of cells, with no cell in both, as one sorted list. */
function merge(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && (a[i] as number) < (b[j] as number)))
      out.push(a[i++] as number);
    else out.push(b[j++] as number);
  }
  return out;
}

function oxygenOn(s: Survey, network: number): number {
  return (s.tanksOn.get(network) ?? []).reduce(
    (sum, tank) => sum + (s.held.get(tank)?.oxygen ?? 0),
    0,
  );
}

/**
 * Takes up to `amount` from a network, tank by tank in id order; returns what it took. Tanks left
 * empty stay listed until the end of the tick.
 */
function draw(s: Survey, network: number, amount: number): number {
  let left = amount;
  for (const tank of s.tanksOn.get(network) ?? []) {
    const held = s.held.get(tank);
    if (!held || left === 0) continue;
    const taken = Math.min(held.oxygen, left);
    held.oxygen -= taken;
    left -= taken;
  }
  return amount - left;
}

function status(s: Survey, room: Room): RoomStatus {
  if (room.openings.length > 0) return 'venting';
  if (s.airedIn[room.id] === room.volume) return 'aired';
  const vents = s.ventsIn.get(room.id) ?? [];
  return vents.some((n) => oxygenOn(s, n) >= AIR.perCell) ? 'filling' : 'vacuum';
}

/** What a room's state is, read from its cells and its vents' networks. */
export function statusOf(air: Seen, world: World, room: number): RoomStatus {
  const found = world.rooms.room(room);
  return found ? status(survey(air, world), found) : 'vacuum';
}

/**
 * Draws up to `amount` for a hero at `cell`, if the cell is in an aired room, from the networks of
 * the room's vents in vent id order; returns what it took. Nothing anywhere else.
 */
export function breathe(air: Air, world: World, cell: number, amount: number): number {
  const id = world.rooms.roomOfCells()[cell] ?? -1;
  const room = id >= 0 ? world.rooms.room(id) : undefined;
  if (!room) return 0;
  const s = survey(air, world);
  if (status(s, room) !== 'aired') return 0;
  let taken = 0;
  for (const network of s.ventsIn.get(room.id) ?? []) {
    taken += draw(s, network, amount - taken);
  }
  if (air.tanks.some((t) => t.oxygen === 0)) air.tanks = air.tanks.filter((t) => t.oxygen > 0);
  return taken;
}

/** The oxygen a room loses through its hull every `AIR.leakEvery` ticks. */
function leakOf(world: World, room: Room): number {
  let leak = 0;
  for (const cell of room.hull) {
    const s = world.grid.structureAt(cell);
    if (s.kind === 'wall') leak += MATERIALS[s.material].leak;
    else if (s.kind === 'door') leak += AIR.doorLeak;
  }
  return leak;
}

/**
 * One tick of air, in this order: cells no longer in a room lose their air; rooms open to space lose
 * theirs, and every vent in such a room or in space drains its network; on a fill beat each filling
 * room airs its smallest unaired cell from the first of its vents that can pay; on a leak beat each
 * aired room pays its leak, losing all its air if its networks cannot. Each pass over cells walks the
 * grid or the aired list once for all rooms, never once per room: a big ship has hundreds of rooms.
 */
export function stepAir(air: Air, world: World, clock: number): void {
  const { rooms } = world;
  const roomOf = rooms.roomOfCells();
  const roomOfCell = (cell: number) => roomOf[cell] ?? -1;
  if (air.aired.some((cell) => roomOfCell(cell) < 0)) {
    air.aired = air.aired.filter((cell) => roomOfCell(cell) >= 0);
  }
  const s = survey(air, world);
  // Rooms losing their air this tick; their cells leave the list once, at the end.
  const losing = new Set<number>();
  const loseAir = (room: number) => {
    losing.add(room);
    s.airedIn[room] = 0;
  };

  for (const room of rooms.rooms()) {
    if (room.openings.length === 0) continue;
    if ((s.airedIn[room.id] ?? 0) > 0) loseAir(room.id);
    for (const network of s.ventsIn.get(room.id) ?? []) draw(s, network, AIR.ventDrain);
  }
  for (const network of s.ventsIn.get('space') ?? []) draw(s, network, AIR.ventDrain);

  if (clock % AIR.ticksPerCell === 0) {
    // The rooms that air a cell this beat, each paid for from the first vent that can pay.
    const wanting = new Set<number>();
    for (const room of rooms.rooms()) {
      if (!s.ventsIn.has(room.id) || status(s, room) !== 'filling') continue;
      const network = (s.ventsIn.get(room.id) ?? []).find((n) => oxygenOn(s, n) >= AIR.perCell);
      if (network === undefined) continue;
      draw(s, network, AIR.perCell);
      wanting.add(room.id);
    }
    if (wanting.size > 0) {
      // Each wanting room's smallest unaired cell, found in one walk alongside the sorted list.
      const added: number[] = [];
      let next = 0;
      for (let cell = 0; cell < roomOf.length && wanting.size > 0; cell++) {
        while (next < air.aired.length && (air.aired[next] as number) < cell) next++;
        const room = roomOfCell(cell);
        if (!wanting.has(room) || air.aired[next] === cell) continue;
        added.push(cell);
        wanting.delete(room);
        s.airedIn[room] = (s.airedIn[room] ?? 0) + 1;
      }
      air.aired = merge(air.aired, added);
    }
  }

  if (clock % AIR.leakEvery === 0) {
    for (const room of rooms.rooms()) {
      if (!s.airedIn[room.id] || status(s, room) !== 'aired') continue;
      let unpaid = leakOf(world, room);
      for (const network of s.ventsIn.get(room.id) ?? []) {
        unpaid -= draw(s, network, unpaid);
      }
      if (unpaid > 0) loseAir(room.id);
    }
  }

  if (losing.size > 0) air.aired = air.aired.filter((cell) => !losing.has(roomOfCell(cell)));
  if (air.tanks.some((t) => t.oxygen === 0)) air.tanks = air.tanks.filter((t) => t.oxygen > 0);
}
