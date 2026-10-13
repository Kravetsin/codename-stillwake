/**
 * How far along the pipes each cell of a network is from where oxygen comes into it: 0 at each
 * source, one more each cell along, by the fewest cells. Cells no source reaches are left out.
 * Oxygen is drawn flowing from lower to higher.
 */
export function stepsFrom(
  cells: readonly number[],
  width: number,
  sources: readonly number[],
): Map<number, number> {
  const own = new Set(cells);
  const steps = new Map<number, number>();
  let front = sources.filter((cell) => own.has(cell));
  for (const cell of front) steps.set(cell, 0);
  for (let d = 1; front.length > 0; d++) {
    const next: number[] = [];
    for (const cell of front) {
      const x = cell % width;
      const around = [
        x > 0 ? cell - 1 : -1,
        x < width - 1 ? cell + 1 : -1,
        cell - width,
        cell + width,
      ];
      for (const n of around) {
        if (!own.has(n) || steps.has(n)) continue;
        steps.set(n, d);
        next.push(n);
      }
    }
    front = next;
  }
  return steps;
}

/** A link of pipe oxygen is drawn flowing along: from the middle of one cell to the next. */
export interface Run {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  /** How far along the pipes its start is. */
  readonly steps: number;
}

/** Every link of `cells` from a cell to a neighbour one step farther from the sources, in cells. */
export function runsOf(steps: ReadonlyMap<number, number>, width: number): Run[] {
  const runs: Run[] = [];
  for (const [cell, d] of steps) {
    const x = cell % width;
    const y = Math.floor(cell / width);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if ((dx === 1 && x === width - 1) || (dx === -1 && x === 0)) continue;
      if (steps.get(cell + dy * width + dx) === d + 1) {
        runs.push({ x: x + 0.5, y: y + 0.5, dx, dy, steps: d });
      }
    }
  }
  return runs;
}

/**
 * Where dots flowing along `runs` are when the flow has gone `along` cells: one every `every`
 * cells, each moving on a cell as `along` grows by one, so they run smoothly through every bend.
 */
export function dotsOf(
  runs: readonly Run[],
  along: number,
  every: number,
): { x: number; y: number }[] {
  const dots: { x: number; y: number }[] = [];
  for (const run of runs) {
    const u = (((along - run.steps) % every) + every) % every;
    if (u >= 1) continue;
    dots.push({ x: run.x + run.dx * u, y: run.y + run.dy * u });
  }
  return dots;
}
