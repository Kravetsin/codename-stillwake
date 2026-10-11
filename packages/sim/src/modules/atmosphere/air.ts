import { AIR, MATERIALS } from '@stillwake/content';
import type { DeepReadonly, QueryApi } from '../../core/module';
import type { GridModule } from '../grid';
import type { PipesModule } from '../pipes';
import type { Room, RoomsModule } from '../rooms';
import type { Orders } from './order';

export type RoomStatus = 'vacuum' | 'filling' | 'aired' | 'venting';

/**
 * The oxygen a tank holds, by machine id; the aired cells, sorted. A cell of air is a unit of
 * oxygen. Air stays where it is: vents air the first empty cell of their room's order (`order.ts`),
 * and whatever takes air takes the last aired one.
 */
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
  /** Per cell, whether it holds air: kept current as the rules below change it. */
  readonly airedAt: Uint8Array;
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
  const airedAt = new Uint8Array(roomOf.length);
  for (const cell of air.aired) {
    airedAt[cell] = 1;
    const room = roomOf[cell] ?? -1;
    if (room >= 0) airedIn[room] = (airedIn[room] ?? 0) + 1;
  }
  const held = new Map(air.tanks.map((t) => [t.tank, t as { tank: number; oxygen: number }]));
  return { ventsIn, tanksOn, airedIn, airedAt, held };
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
  return vents.some((n) => oxygenOn(s, n) > 0) ? 'filling' : 'vacuum';
}

/** What a room's state is, read from its cells and its vents' networks. */
export function statusOf(air: Seen, world: World, room: number): RoomStatus {
  const found = world.rooms.room(room);
  return found ? status(survey(air, world), found) : 'vacuum';
}

/** What a tick does to the aired list, applied once at the end: the list is long. */
interface Edits {
  readonly removed: Set<number>;
  readonly added: number[];
}

/** Takes up to `count` cells of air from `room`, the aired ones last in its order first. */
function takeFar(s: Survey, orders: Orders, room: number, count: number, edits: Edits): number {
  const order = orders.get(room) ?? [];
  let taken = 0;
  for (let i = order.length - 1; i >= 0 && taken < count && (s.airedIn[room] ?? 0) > 0; i--) {
    const cell = order[i] as number;
    if (!s.airedAt[cell]) continue;
    s.airedAt[cell] = 0;
    s.airedIn[room] = (s.airedIn[room] ?? 0) - 1;
    edits.removed.add(cell);
    taken++;
  }
  return taken;
}

/** The first cell of `room`'s order without air: where its vents put the next. */
function nextEmpty(s: Survey, orders: Orders, room: number): number | undefined {
  for (const cell of orders.get(room) ?? []) if (!s.airedAt[cell]) return cell;
  return undefined;
}

function applyEdits(air: Air, edits: Edits): void {
  if (edits.removed.size === 0 && edits.added.length === 0) return;
  const kept =
    edits.removed.size === 0 ? air.aired : air.aired.filter((cell) => !edits.removed.has(cell));
  // A cell taken and aired again on one tick is in both: dropped above, back below.
  air.aired = merge(
    kept,
    edits.added.sort((a, b) => a - b),
  );
}

/**
 * Takes up to `amount` of air for a hero in `cell`, if its room holds any: paid by the networks of
 * the room's vents in vent id order, as if they put back at once what is taken, and what they cannot
 * pay taken as cells from the far edge. Returns how much, none in a room with no air or elsewhere.
 */
export function breathe(
  air: Air,
  world: World,
  orders: Orders,
  cell: number,
  amount: number,
): number {
  const room = world.rooms.roomOfCells()[cell] ?? -1;
  if (room < 0) return 0;
  const s = survey(air, world);
  if (!s.airedIn[room]) return 0;
  const edits: Edits = { removed: new Set(), added: [] };
  const had = use(s, orders, room, amount, edits);
  applyEdits(air, edits);
  if (air.tanks.some((t) => t.oxygen === 0)) air.tanks = air.tanks.filter((t) => t.oxygen > 0);
  return had;
}

/**
 * Uses up to `amount` of `room`'s air: paid by the networks of its vents in vent id order, as if
 * they put back at once what is used, and what they cannot pay taken as cells from the far edge.
 * Returns how much was had.
 */
function use(s: Survey, orders: Orders, room: number, amount: number, edits: Edits): number {
  let had = 0;
  for (const network of s.ventsIn.get(room) ?? []) had += draw(s, network, amount - had);
  return had + takeFar(s, orders, room, amount - had, edits);
}

/** Takes the air out of cells no longer in a room: a wall built on them, a room open wide. */
export function strand(air: Air, world: World): void {
  const roomOf = world.rooms.roomOfCells();
  if (air.aired.some((cell) => (roomOf[cell] ?? -1) < 0)) {
    air.aired = air.aired.filter((cell) => (roomOf[cell] ?? -1) >= 0);
  }
}

/** A room's air, as the air overlay shows it. */
export interface RoomAir {
  readonly room: number;
  readonly status: RoomStatus;
  /** Its cells holding air, of its volume. */
  readonly aired: number;
  /** The cells it loses through its hull every `AIR.leakEvery` ticks: each hull cell's leak. */
  readonly leak: number;
  /** The oxygen on its vents' networks, each network counted once. */
  readonly oxygen: number;
  /**
   * Ticks its networks last at what this room alone draws: refilling its leak if aired, its vents'
   * drain if venting. None otherwise, or when nothing is drawn.
   */
  readonly lasts: number | undefined;
  /** Why a room in vacuum gets no air, as an i18n key. */
  readonly problem: 'atmosphere.noVent' | 'atmosphere.notPiped' | 'atmosphere.dry' | undefined;
}

/** Every room's air, in `rooms()` order, from one survey. */
export function roomsAir(air: Seen, world: World): RoomAir[] {
  const s = survey(air, world);
  const roomOf = world.rooms.roomOfCells();
  // Vents standing in each room, piped or not: the survey keeps only the piped ones.
  const standing = new Set<number>();
  for (const m of world.grid.machines()) if (m.kind === 'vent') standing.add(roomOf[m.cell] ?? -1);
  return world.rooms.rooms().map((room) => {
    const networks = s.ventsIn.get(room.id) ?? [];
    const oxygen = [...new Set(networks)].reduce((sum, n) => sum + oxygenOn(s, n), 0);
    const now = status(s, room);
    const leak = leakOf(world, room);
    // Venting, each vent drains its network, so a network under two vents drains twice.
    const lasts =
      now === 'aired' && leak > 0
        ? Math.floor((oxygen * AIR.leakEvery) / leak)
        : now === 'venting' && networks.length > 0
          ? Math.ceil(oxygen / (AIR.ventDrain * networks.length))
          : undefined;
    const problem =
      now !== 'vacuum'
        ? undefined
        : !standing.has(room.id)
          ? 'atmosphere.noVent'
          : networks.length === 0
            ? 'atmosphere.notPiped'
            : 'atmosphere.dry';
    return {
      room: room.id,
      status: now,
      aired: s.airedIn[room.id] ?? 0,
      leak,
      oxygen,
      lasts,
      problem,
    };
  });
}

/**
 * Each room's leak, found once: a room is a new object whenever the structure changes, and nothing
 * else changes what its hull is made of.
 */
const leaks = new WeakMap<Room, number>();

/** The cells of air a room loses through its hull every `AIR.leakEvery` ticks. */
function leakOf(world: World, room: Room): number {
  const known = leaks.get(room);
  if (known !== undefined) return known;
  let leak = 0;
  for (const cell of room.hull) {
    const s = world.grid.structureAt(cell);
    if (s.kind === 'wall') leak += MATERIALS[s.material].leak;
    else if (s.kind === 'door') leak += AIR.doorLeak;
  }
  leaks.set(room, leak);
  return leak;
}

/**
 * One tick of air, in this order: a room open to space loses `AIR.ventLoss` cells from the far edge,
 * and every vent in it or in space drains its network; on a fill beat each filling room airs the
 * first empty cell of its order, paid from the first of its vents that can pay; then every other
 * room holding air uses its hull leak, spread over each \`AIR.leakEvery\` ticks: paid by its vents'
 * networks, and what they cannot pay taken from its air's far edge.
 */
export function stepAir(air: Air, world: World, orders: Orders, clock: number): void {
  const s = survey(air, world);
  const edits: Edits = { removed: new Set(), added: [] };

  for (const room of world.rooms.rooms()) {
    if (room.openings.length === 0) continue;
    takeFar(s, orders, room.id, AIR.ventLoss, edits);
    for (const network of s.ventsIn.get(room.id) ?? []) draw(s, network, AIR.ventDrain);
  }
  for (const network of s.ventsIn.get('space') ?? []) draw(s, network, AIR.ventDrain);

  if (clock % AIR.ticksPerCell === 0) {
    for (const room of world.rooms.rooms()) {
      if (!s.ventsIn.has(room.id) || status(s, room) !== 'filling') continue;
      const network = (s.ventsIn.get(room.id) ?? []).find((n) => oxygenOn(s, n) > 0);
      const next = nextEmpty(s, orders, room.id);
      if (network === undefined || next === undefined) continue;
      draw(s, network, 1);
      edits.added.push(next);
      s.airedAt[next] = 1;
      s.airedIn[room.id] = (s.airedIn[room.id] ?? 0) + 1;
    }
  }

  // Each tick's share of a minute's leak: what is due by its end, less what was by its start.
  const beat = clock % AIR.leakEvery;
  const dueBy = (leak: number, ticks: number) => Math.floor((leak * ticks) / AIR.leakEvery);
  for (const room of world.rooms.rooms()) {
    if (room.openings.length > 0 || !s.airedIn[room.id]) continue;
    const leak = leakOf(world, room);
    use(s, orders, room.id, dueBy(leak, beat + 1) - dueBy(leak, beat), edits);
  }

  applyEdits(air, edits);
  if (air.tanks.some((t) => t.oxygen === 0)) air.tanks = air.tanks.filter((t) => t.oxygen > 0);
}
