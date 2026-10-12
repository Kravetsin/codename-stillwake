import { MACHINES, type MachineSpec } from '@stillwake/content';
import type { grid, QueryApi, rooms } from '@stillwake/sim';

/** A point in the world, in cells. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** How deep a cable hangs inside the ship, as a share of its length. */
const SAG = 0.12;
/** Points a drawn cable is made of, ends included. */
const STEPS = 16;

/**
 * Where a cable meets node `node` coming from `toward`: an anchor's middle, or the point of a
 * machine's box nearest to `toward`, so a cable seems plugged in wherever it reaches the machine.
 */
export function endOf(q: QueryApi<typeof grid>, node: number, toward: Point): Point {
  const { width } = q.size();
  const x = node % width;
  const y = Math.floor(node / width);
  const machine = q.machineAt(node);
  if (!machine || machine.cell !== node) return { x: x + 0.5, y: y + 0.5 };
  const spec: MachineSpec = MACHINES[machine.kind];
  // A little inside the box, so the end sits on the machine rather than on its outline.
  const inset = 0.15;
  return {
    x: Math.min(x + spec.width - inset, Math.max(x + inset, toward.x)),
    y: Math.min(y + spec.height - inset, Math.max(y + inset, toward.y)),
  };
}

/** A node's middle, in cells: what the other end of a cable aims at. */
export function middleOf(q: QueryApi<typeof grid>, node: number): Point {
  const { width } = q.size();
  const machine = q.machineAt(node);
  const spec: MachineSpec | undefined =
    machine && machine.cell === node ? MACHINES[machine.kind] : undefined;
  return {
    x: (node % width) + (spec?.width ?? 1) / 2,
    y: Math.floor(node / width) + (spec?.height ?? 1) / 2,
  };
}

/**
 * The points of a cable from `a` to `b`: hanging in a parabola as deep as `SAG` of its length under
 * gravity, straight with no gravity to pull it, out in space.
 */
export function cablePoints(a: Point, b: Point, hangs: boolean): Point[] {
  const depth = hangs ? Math.hypot(b.x - a.x, b.y - a.y) * SAG : 0;
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + 4 * depth * t * (1 - t) };
  });
}

/** How far `p` is from the nearest point of a cable drawn through `points`, in cells. */
export function distanceTo(points: readonly Point[], p: Point): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t =
      length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
    best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y));
  }
  return best;
}

interface Queries {
  readonly grid: QueryApi<typeof grid>;
  readonly rooms: QueryApi<typeof rooms>;
}

/** Whether a cable ending at `cell` hangs there: anywhere but out in space, where nothing pulls it. */
export const hangsAt = (q: Queries, cell: number) => q.rooms.roomAt(cell) !== 'space';

/** The points of the cable between nodes `a` and `b`, each end where it meets its node. */
export function shapeOf(q: Queries, a: number, b: number): Point[] {
  const toA = middleOf(q.grid, a);
  const toB = middleOf(q.grid, b);
  return cablePoints(endOf(q.grid, a, toB), endOf(q.grid, b, toA), hangsAt(q, a) && hangsAt(q, b));
}

/** Whether the cell under `p` hides a cable: a wall or a closed door, drawn over it. */
export function hidden(q: QueryApi<typeof grid>, p: Point): boolean {
  const { width, height } = q.size();
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const s = q.structureAt(y * width + x);
  return s.kind === 'wall' || (s.kind === 'door' && !s.open);
}
