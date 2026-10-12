import { AIR, MATERIALS } from '@stillwake/content';
import type { DeepReadonly, QueryApi } from '../../core/module';
import type { GridModule } from '../grid';
import type { PipesModule } from '../pipes';
import type { PowerModule } from '../power';
import type { Room, RoomsModule } from '../rooms';
import type { Orders } from './order';

export type RoomStatus = 'vacuum' | 'filling' | 'aired' | 'venting';

/**
 * The oxygen each tank or generator holds, by machine id; the aired cells, sorted. A cell of air is a unit of
 * oxygen. Air stays where it is: vents air the first empty cell of their room's order (`order.ts`),
 * and whatever takes air takes the last aired one.
 */
export interface Air {
  tanks: { tank: number; oxygen: number }[];
  aired: number[];
  /**
   * Each generator's work toward its next unit, by machine id, in id order: a unit is
   * `AIR.leakEvery × 1000`, and a generator adds `AIR.generatorRate` × its power's satisfaction a tick.
   */
  making: { generator: number; part: number }[];
}

type Seen = DeepReadonly<Air>;

export interface World {
  readonly grid: QueryApi<GridModule>;
  readonly rooms: QueryApi<RoomsModule>;
  readonly pipes: QueryApi<PipesModule>;
  readonly power: QueryApi<PowerModule>;
}

/**
 * Who is where, gathered in one pass over the machines and the aired cells, so the rules below read
 * maps instead of scanning the ship once per room: the reference world has hundreds of rooms.
 */
interface Survey {
  /** The networks of the vents standing in each room, or in space, in vent id order. */
  readonly ventsIn: Map<number | 'space', number[]>;
  /** The tanks and generators on each network, in id order: draws take from both alike. */
  readonly tanksOn: Map<number, number[]>;
  /** The satisfaction, in thousandths, of the generators on each network, summed: 0 when none is powered. */
  readonly madeOn: Map<number, number>;
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
  const madeOn = new Map<number, number>();
  for (const m of world.grid.machines()) {
    if (m.kind !== 'vent' && m.kind !== 'tank' && m.kind !== 'generator') continue;
    for (const port of world.grid.portsOf(m)) {
      const network = world.pipes.networkAt(port);
      if (network === undefined) continue;
      if (m.kind !== 'vent') {
        const tanks = tanksOn.get(network);
        if (tanks) tanks.push(m.id);
        else tanksOn.set(network, [m.id]);
        if (m.kind === 'generator') {
          madeOn.set(network, (madeOn.get(network) ?? 0) + world.power.satisfaction(m.id));
        }
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
  return { ventsIn, tanksOn, madeOn, airedIn, airedAt, held };
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
  // A powered generator's store sits empty between the units it makes: its room is filling all the same.
  return vents.some((n) => (s.madeOn.get(n) ?? 0) > 0 || oxygenOn(s, n) > 0) ? 'filling' : 'vacuum';
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
 * Takes up to `amount` of air for a hero in `cell`, if that cell holds air: paid by the networks of
 * the room's vents in vent id order, as if they put back at once what is taken, and what they cannot
 * pay taken as cells from the far edge. Returns how much, none in a cell without air.
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
  if (!s.airedAt[cell]) return 0;
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
  /** What the generators on those networks make every `AIR.leakEvery` ticks, together. */
  readonly made: number;
  /**
   * Ticks its networks last at what this room alone draws: refilling its leak if aired, its vents'
   * drain if venting. None otherwise, when nothing is drawn, or when a generator feeds it.
   */
  readonly lasts: number | undefined;
  /** Why a room in vacuum gets no air, as an i18n key. */
  readonly problem:
    | 'atmosphere.noVent'
    | 'atmosphere.notPiped'
    | 'atmosphere.unpowered'
    | 'atmosphere.dry'
    | undefined;
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
    const made = [...new Set(networks)].reduce(
      (sum, n) => sum + Math.floor(((s.madeOn.get(n) ?? 0) * AIR.generatorRate) / 1000),
      0,
    );
    const now = status(s, room);
    const leak = leakOf(world, room);
    // Venting, each vent drains its network, so a network under two vents drains twice.
    const lasts =
      made > 0
        ? undefined
        : now === 'aired' && leak > 0
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
            : networks.some((n) => s.madeOn.has(n))
              ? 'atmosphere.unpowered'
              : 'atmosphere.dry';
    return {
      room: room.id,
      status: now,
      aired: s.airedIn[room.id] ?? 0,
      leak,
      oxygen,
      made,
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

/** A tick's share of `perMinute`, spread over each `AIR.leakEvery` ticks so a minute's total is exact. */
function dueAt(perMinute: number, clock: number): number {
  const beat = clock % AIR.leakEvery;
  const dueBy = (ticks: number) => Math.floor((perMinute * ticks) / AIR.leakEvery);
  return dueBy(beat + 1) - dueBy(beat);
}

/**
 * Each generator, in id order, works toward its next unit by `AIR.generatorRate` × its power's
 * satisfaction, and puts each unit it finishes into its own store, up to `AIR.generatorStore`; what
 * does not fit is lost. A store emptied leaves the list, as a tank's. At full power a minute makes
 * exactly the rate; the fraction carries over in `making`.
 */
function produce(air: Air, world: World): void {
  const unit = AIR.leakEvery * 1000;
  const making: Air['making'] = [];
  let added = false;
  for (const m of world.grid.machines()) {
    if (m.kind !== 'generator') continue;
    let part =
      (air.making.find((g) => g.generator === m.id)?.part ?? 0) +
      AIR.generatorRate * world.power.satisfaction(m.id);
    const made = Math.floor(part / unit);
    part -= made * unit;
    making.push({ generator: m.id, part });
    if (made === 0) continue;
    const store = air.tanks.find((t) => t.tank === m.id);
    if (store) store.oxygen = Math.min(AIR.generatorStore, store.oxygen + made);
    else {
      air.tanks.push({ tank: m.id, oxygen: Math.min(AIR.generatorStore, made) });
      added = true;
    }
  }
  air.making = making;
  if (added) air.tanks.sort((a, b) => a.tank - b.tank);
}

/**
 * One tick of air, in this order: generators make their share, so it pays this tick's fill and
 * breaths; a room open to space loses `AIR.ventLoss` cells from the far edge,
 * and every vent in it or in space drains its network; on a fill beat each filling room airs the
 * first empty cell of its order, paid from the first of its vents that can pay; then every other
 * room holding air uses its hull leak, spread over each \`AIR.leakEvery\` ticks: paid by its vents'
 * networks, and what they cannot pay taken from its air's far edge.
 */
export function stepAir(air: Air, world: World, orders: Orders, clock: number): void {
  produce(air, world);
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

  for (const room of world.rooms.rooms()) {
    if (room.openings.length > 0 || !s.airedIn[room.id]) continue;
    use(s, orders, room.id, dueAt(leakOf(world, room), clock), edits);
  }

  applyEdits(air, edits);
  if (air.tanks.some((t) => t.oxygen === 0)) air.tanks = air.tanks.filter((t) => t.oxygen > 0);
}
