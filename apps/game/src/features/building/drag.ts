import {
  building,
  command,
  type Command,
  type grid,
  type Layer,
  type QueryApi,
} from '@stillwake/sim';
import type { Button } from '../../render/camera';
import type { Tool } from './tools';

/** A cell by its column and row. */
export interface Spot {
  readonly x: number;
  readonly y: number;
}

/** What a drag does: a card's work, or the right button's removal from `layers` (0022). */
export type Act = Tool | { readonly kind: 'remove'; readonly layers: readonly Layer[] };

/** One cell of a drag: why the tool cannot work there, if it cannot, and what it sends if it can. */
export interface Verdict {
  readonly cell: number;
  readonly problem: string | undefined;
  readonly commands: readonly Command[];
}

interface Queries {
  readonly grid: QueryApi<typeof grid>;
  readonly building: QueryApi<typeof building>;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/** The cell under a world point, kept on the grid: a drag that leaves it runs along the edge. */
export function spotAt(size: Size, p: { x: number; y: number }): Spot {
  return {
    x: Math.min(size.width - 1, Math.max(0, Math.floor(p.x))),
    y: Math.min(size.height - 1, Math.max(0, Math.floor(p.y))),
  };
}

export function onGrid(size: Size, p: { x: number; y: number }): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < size.width && p.y < size.height;
}

/**
 * One left-button event in a drag: a press on the grid starts one where it is, a release ends the
 * one under way and gives its two ends. A press off the grid starts nothing.
 */
export function onButton(
  pressed: Spot | undefined,
  button: Pick<Button, 'down' | 'at'>,
  size: Size,
): { pressed: Spot | undefined; line?: readonly [Spot, Spot] } {
  if (button.down)
    return { pressed: onGrid(size, button.at) ? spotAt(size, button.at) : undefined };
  if (!pressed) return { pressed: undefined };
  return { pressed: undefined, line: [pressed, spotAt(size, button.at)] };
}

/**
 * The cells a drag from `from` to `to` covers: a straight line along the longer axis, horizontal on a
 * tie. A machine goes only where the drag began.
 */
export function lineOf(width: number, tool: Act, from: Spot, to: Spot): number[] {
  if (tool.kind === 'place' && tool.placement.layer === 'machine') return [from.y * width + from.x];
  const across = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  const length = across ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y);
  const step = Math.sign(across ? to.x - from.x : to.y - from.y);
  const cells: number[] = [];
  for (let i = 0; i <= length; i++) {
    const x = across ? from.x + i * step : from.x;
    const y = across ? from.y : from.y + i * step;
    cells.push(y * width + x);
  }
  return cells;
}

/**
 * What `tool` would do in each of `cells`, as the sim judges it now. Removing cancels plans if the
 * drag begins on one, a mark included, and marks what is built in its layers otherwise.
 */
export function judge(tool: Act, cells: readonly number[], q: Queries): Verdict[] {
  // A machine spans several cells of a line, yet takes one mark and is cancelled once.
  const cancelled = new Set<number>();
  const marked = new Set<string>();
  const first = cells[0];
  const cancels = first !== undefined && q.building.plansAt(first).length > 0;
  return cells.map((cell) => {
    switch (tool.kind) {
      case 'place': {
        const problem = q.building.problem(cell, { place: tool.placement });
        const send = command(building, 'placePlan', { cell, placement: tool.placement });
        return { cell, problem, commands: problem ? [] : [send] };
      }
      case 'remove': {
        if (cancels) {
          const ids = q.building
            .plansAt(cell)
            .map((p) => p.id)
            .filter((id) => !cancelled.has(id));
          for (const id of ids) cancelled.add(id);
          const covered = q.building.plansAt(cell).length > 0;
          return {
            cell,
            problem: covered ? undefined : 'building.noPlan',
            commands: ids.map((id) => command(building, 'cancelPlan', { id })),
          };
        }
        const next = q.building.clearAt(cell, tool.layers);
        if (!next) return { cell, problem: 'building.nothingThere', commands: [] };
        const problem = q.building.problem(cell, { clear: next.layer });
        const target = `${next.layer}:${next.cell}`;
        if (problem || marked.has(target)) return { cell, problem, commands: [] };
        marked.add(target);
        return {
          cell,
          problem,
          commands: [command(building, 'deconstruct', { cell, layer: next.layer })],
        };
      }
      case 'cable':
        // A cable is laid by the power feature, from press to release, not along a line of cells.
        return { cell, problem: undefined, commands: [] };
    }
  });
}
