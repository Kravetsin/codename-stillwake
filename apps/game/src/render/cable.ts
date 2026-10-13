import { MACHINES, type MachineSpec } from '@stillwake/content';
import type { grid, QueryApi, rooms } from '@stillwake/sim';

/** A point in the world, in cells. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** How deep a cable hangs inside the ship, as a share of its length. */
export const SAG = 0.12;
/** Links a drawn cable is made of. */
export const STEPS = 16;

/**
 * Where a cable meets node `node`: a machine's socket (`plug` in `MACHINES`), or an anchor's middle.
 * One socket a machine, so every cable to it plugs in at one place.
 */
export function endOf(q: QueryApi<typeof grid>, node: number): Point {
  const { width } = q.size();
  const x = node % width;
  const y = Math.floor(node / width);
  const machine = q.machineAt(node);
  const plug: MachineSpec['plug'] =
    machine && machine.cell === node ? (MACHINES[machine.kind] as MachineSpec).plug : undefined;
  return plug ? { x: x + plug.x / 16, y: y + plug.y / 16 } : { x: x + 0.5, y: y + 0.5 };
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

/** A stretch of a cable between two fixed points: hanging aboard, floating out in space. */
export interface Piece {
  readonly from: Point;
  readonly to: Point;
  readonly hangs: boolean;
}

/** How finely the way between a cable's ends is walked to find where it goes through the hull. */
const PROBE = 0.05;

/**
 * The cable between nodes `a` and `b`, each end where it meets its node, in pieces: where its way
 * passes from space through the hull into the ship it is held, in the middle of the wall it goes
 * through, so the part aboard hangs and the part outside floats. `feeds` are those points, a
 * fitting drawn on the wall at each. Only drawn: the sim knows a cable by its two nodes.
 */
export function piecesOf(q: Queries, a: number, b: number): { pieces: Piece[]; feeds: Point[] } {
  const from = endOf(q.grid, a);
  const to = endOf(q.grid, b);
  const { width, height } = q.grid.size();
  const kindAt = (t: number): 'space' | 'solid' | 'aboard' => {
    const x = Math.floor(from.x + (to.x - from.x) * t);
    const y = Math.floor(from.y + (to.y - from.y) * t);
    if (x < 0 || y < 0 || x >= width || y >= height) return 'space';
    const room = q.rooms.roomAt(y * width + x);
    return room === 'space' ? 'space' : room === undefined ? 'solid' : 'aboard';
  };
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / PROBE));
  const kinds = Array.from({ length: steps + 1 }, (_, i) => kindAt(i / steps));
  // Where the way changes between space and the ship: in the middle of the wall between, if any.
  const splits: { t: number; feed: boolean }[] = [];
  let last: { kind: 'space' | 'aboard'; at: number } | undefined;
  for (let i = 0; i <= steps; i++) {
    const kind = kinds[i];
    if (kind === 'solid' || kind === undefined) continue;
    if (last && last.kind !== kind) {
      const wall = i - last.at > 1;
      splits.push({ t: (wall ? (last.at + 1 + i - 1) / 2 : i - 0.5) / steps, feed: wall });
    }
    last = { kind, at: i };
  }
  const at = (t: number): Point => ({
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  });
  const ts = [0, ...splits.map((s) => s.t), 1];
  const pieces = ts.slice(1).map((end, i) => {
    const start = ts[i] ?? 0;
    const first = Math.round(start * steps);
    const stop = Math.round(end * steps);
    return {
      from: at(start),
      to: at(end),
      hangs: !kinds.slice(first, stop + 1).includes('space'),
    };
  });
  return { pieces, feeds: splits.filter((s) => s.feed).map((s) => at(s.t)) };
}

/** The points of the cable between nodes `a` and `b` at rest, piece by piece. */
export function shapeOf(q: Queries, a: number, b: number): Point[] {
  return piecesOf(q, a, b).pieces.flatMap((p, i) =>
    cablePoints(p.from, p.to, p.hangs).slice(i === 0 ? 0 : 1),
  );
}
