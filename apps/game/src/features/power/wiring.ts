import type { Point } from '../../render/cable';

/** How near a press must be to a cable's end at a machine, in cells, to take that end. */
const END_REACH = 0.5;
/** How finely the way back from the pointer is walked for a support, in cells. */
const STEP = 0.25;

/** How a node lights while a cable is dragged, by the sim's answer for it. */
export type Light = 'fits' | 'far' | 'refused';

/** A node a cable fits, one too far for a cable to reach, or one refused for another reason. */
export function lightOf(problem: string | undefined): Light {
  if (!problem) return 'fits';
  return problem === 'power.tooLong' || problem === 'power.taut' ? 'far' : 'refused';
}

/** A cable as drawn: its nodes and its points from node `a` to node `b`. */
export interface Line {
  readonly a: number;
  readonly b: number;
  readonly points: readonly Point[];
}

/** What a press with the cable in hand takes hold of. */
export type Grip =
  /** A cable's end at a machine: that cable alone moves from the machine. */
  | { readonly kind: 'end'; readonly node: number; readonly cable: { a: number; b: number } }
  /** A support, an anchor cables end on: every cable there moves with it. */
  | { readonly kind: 'support'; readonly node: number }
  /** A node a new cable is laid from. */
  | { readonly kind: 'lay'; readonly node: number };

/**
 * What a press at `at` takes hold of: a cable's end at a machine near it, else the node under it, a
 * support if cables end there and it is no machine, else a node to lay from; nothing elsewhere.
 */
export function gripAt(
  at: Point,
  lines: readonly Line[],
  node: number | undefined,
  isMachine: (node: number) => boolean,
): Grip | undefined {
  let best: { grip: Grip; d: number } | undefined;
  for (const line of lines) {
    const ends = [
      { node: line.a, point: line.points[0] },
      { node: line.b, point: line.points[line.points.length - 1] },
    ];
    for (const end of ends) {
      if (!end.point || !isMachine(end.node)) continue;
      const d = Math.hypot(end.point.x - at.x, end.point.y - at.y);
      if (d > END_REACH || (best && best.d <= d)) continue;
      best = { grip: { kind: 'end', node: end.node, cable: { a: line.a, b: line.b } }, d };
    }
  }
  if (best) return best.grip;
  if (node === undefined) return undefined;
  const cabled = lines.some((l) => l.a === node || l.b === node);
  return cabled && !isMachine(node) ? { kind: 'support', node } : { kind: 'lay', node };
}

/**
 * Where a cable led from `from` toward `to`, past what one cable reaches, is held: the cell nearest
 * `to` on the straight way back to `from` that `holds`, a node a cable from `from` may be laid to.
 * Nothing when no cell on the way does.
 */
export function supportOnWay(
  from: Point,
  to: Point,
  width: number,
  holds: (cell: number) => boolean,
): number | undefined {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.ceil(length / STEP);
  for (let i = 0; i < steps; i++) {
    const t = 1 - i / steps;
    const cell =
      Math.floor(from.y + (to.y - from.y) * t) * width + Math.floor(from.x + (to.x - from.x) * t);
    if (holds(cell)) return cell;
  }
  return undefined;
}
