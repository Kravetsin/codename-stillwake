import { MACHINES, POWER, type MachineSpec } from '@stillwake/content';
import type { QueryApi } from '../../core/module';
import type { GridModule, Machine } from '../grid';
import type { RoomsModule } from '../rooms';

type Grid = QueryApi<GridModule>;
type Rooms = QueryApi<RoomsModule>;

/** A cable between two nodes, named by their cells, the lower first. */
export interface Cable {
  readonly a: number;
  readonly b: number;
  /** Whether its cost was taken from whoever laid it, and so is given back when it is cut. */
  readonly paid: boolean;
}

/** A network: the nodes cables join, named by its lowest node cell, and how its power stands. */
export interface PowerNetwork {
  readonly id: number;
  /** Its node cells, ascending. */
  readonly nodes: readonly number[];
  /** Power its makers make a tick, and its users would draw. */
  readonly supply: number;
  readonly demand: number;
  /** What share of its draw each user gets, in thousandths: all slowed alike when short. */
  readonly satisfaction: number;
}

export const spec = (m: Machine): MachineSpec => MACHINES[m.kind];
const isPowered = (m: Machine) => spec(m).makes !== undefined || spec(m).draws !== undefined;

/**
 * The node a cable laid at `cell` ends on: a machine that makes or draws power, named by its
 * top-left cell; or an anchor, the cell itself, where a wall, a floor, a door or a back wall stands and
 * no machine does. Nothing anywhere else.
 */
export function nodeAt(grid: Grid, cell: number): number | undefined {
  const { width, height } = grid.size();
  if (!Number.isSafeInteger(cell) || cell < 0 || cell >= width * height) return undefined;
  const machine = grid.machineAt(cell);
  if (machine) return isPowered(machine) ? machine.cell : undefined;
  const mounted =
    grid.structureAt(cell).kind !== 'empty' || grid.layers().back[cell] === grid.codes().back.wall;
  return mounted ? cell : undefined;
}

/** The cells a node covers, as a box: a machine's footprint, or an anchor's one cell. */
function boxOf(grid: Grid, node: number) {
  const { width } = grid.size();
  const x = node % width;
  const y = Math.floor(node / width);
  const machine = grid.machineAt(node);
  const s = machine && machine.cell === node ? spec(machine) : { width: 1, height: 1 };
  return { x0: x, y0: y, x1: x + s.width - 1, y1: y + s.height - 1 };
}

/** Whether two nodes' nearest cells are within a cable's span: straight, in whole cells. */
export function inSpan(grid: Grid, a: number, b: number): boolean {
  const p = boxOf(grid, a);
  const q = boxOf(grid, b);
  const dx = Math.max(0, q.x0 - p.x1, p.x0 - q.x1);
  const dy = Math.max(0, q.y0 - p.y1, p.y0 - q.y1);
  return dx * dx + dy * dy <= POWER.maxSpan * POWER.maxSpan;
}

/** A pair of nodes as a cable names them, the lower first. */
export const ordered = (a: number, b: number) => (a < b ? { a, b } : { a: b, b: a });

/** A total order on cables: by their first node, then their second. */
export const byEnds = (p: { a: number; b: number }, q: { a: number; b: number }) =>
  p.a - q.a || p.b - q.b;

/** Whether a machine making power stands wholly in space, where the sun reaches it. */
function outside(grid: Grid, rooms: Rooms, m: Machine): boolean {
  return (grid.footprint(m.kind, m.cell) ?? []).every((c) => rooms.roomAt(c) === 'space');
}

/**
 * The networks the cables join, in id order, with each user's satisfaction by machine id. Supply is
 * what the makers out in space make; demand what the users draw. Satisfaction is
 * `floor(1000 × supply / demand)`, at most 1000, and 1000 with nothing drawn. A powered machine with no
 * cable is on no network: it makes nothing and gets nothing.
 */
export function findNetworks(
  grid: Grid,
  rooms: Rooms,
  cables: readonly Cable[],
): { networks: PowerNetwork[]; satisfaction: Map<number, number> } {
  const parent = new Map<number, number>();
  const root = (n: number): number => {
    let r = n;
    while (parent.get(r) !== r) r = parent.get(r) as number;
    // Path halving is not needed at these sizes: networks hold tens of nodes.
    return r;
  };
  for (const c of cables) {
    for (const n of [c.a, c.b]) if (!parent.has(n)) parent.set(n, n);
    const ra = root(c.a);
    const rb = root(c.b);
    // The lower cell stays the root, so a network's id is its lowest node.
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
  }
  const nodes = new Map<number, number[]>();
  for (const n of [...parent.keys()].sort((p, q) => p - q)) {
    const r = root(n);
    const list = nodes.get(r);
    if (list) list.push(n);
    else nodes.set(r, [n]);
  }
  const supply = new Map<number, number>();
  const demand = new Map<number, number>();
  const users: { id: number; network: number }[] = [];
  for (const m of grid.machines()) {
    if (!parent.has(m.cell) || !isPowered(m)) continue;
    const network = root(m.cell);
    const s = spec(m);
    if (s.makes !== undefined && outside(grid, rooms, m)) {
      supply.set(network, (supply.get(network) ?? 0) + s.makes);
    }
    if (s.draws !== undefined) {
      demand.set(network, (demand.get(network) ?? 0) + s.draws);
      users.push({ id: m.id, network });
    }
  }
  const networks = [...nodes].map(([id, list]): PowerNetwork => {
    const made = supply.get(id) ?? 0;
    const drawn = demand.get(id) ?? 0;
    const satisfaction = drawn === 0 ? 1000 : Math.min(1000, Math.floor((1000 * made) / drawn));
    return { id, nodes: list, supply: made, demand: drawn, satisfaction };
  });
  const byId = new Map(networks.map((n) => [n.id, n.satisfaction]));
  return {
    networks,
    satisfaction: new Map(users.map((u) => [u.id, byId.get(u.network) ?? 0])),
  };
}
