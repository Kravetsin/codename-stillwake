import { HERO } from '@stillwake/content';
import {
  building,
  command,
  CONDUIT,
  grid,
  STRUCTURE,
  type Command,
  type QueryApi,
} from '@stillwake/sim';
import { UNIT, type Hero, type Ship } from './hero';

/** The cells the hero aims at: structure for doors, conduit for valves. */
export interface Cells extends Ship {
  readonly conduit: readonly number[];
}

type Plans = Pick<QueryApi<typeof building>, 'plansAt' | 'workProblem'>;

/**
 * The cell under the pointer and what E does there: works a plan while held, or toggles a door or
 * valve when pressed. `problem` is why work would be refused.
 */
export interface Aim {
  readonly cell: number;
  readonly inReach: boolean;
  readonly toggle?: Command;
  readonly work?: { readonly plan: number; readonly problem: string | undefined };
}

/**
 * What the hero aims at with the pointer at `point`, in cells; nothing off the grid. A plan takes E
 * before a door or valve in its cell, so a marked door is taken apart rather than opened. Of several
 * plans, the oldest that can be worked, so one the ship cannot pay for does not block the mark beside
 * it; when none can, the oldest, to show why. A door and a valve may share a cell; E works the door.
 */
export function aimAt(
  cells: Cells,
  plans: Plans,
  hero: Hero,
  point: { x: number; y: number },
): Aim | undefined {
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= cells.width || y >= cells.height) return undefined;
  const cell = y * cells.width + x;
  const dx = x * UNIT + UNIT / 2 - hero.x;
  const dy = y * UNIT + UNIT / 2 - (hero.y - HERO.height / 2);
  const inReach = dx * dx + dy * dy <= HERO.reach * HERO.reach;

  const here = plans.plansAt(cell).map((p) => ({ plan: p.id, problem: plans.workProblem(p.id) }));
  const work = here.find((w) => !w.problem) ?? here[0];
  if (work) return { cell, inReach, work };
  const toggle = toggleOf(cells, cell);
  return toggle ? { cell, inReach, toggle } : { cell, inReach };
}

function toggleOf(cells: Cells, cell: number): Command | undefined {
  const s = cells.structure[cell];
  if (s === STRUCTURE.doorClosed || s === STRUCTURE.doorOpen) {
    return command(grid, 'toggleDoor', { cell });
  }
  const c = cells.conduit[cell];
  if (c === CONDUIT.valveClosed || c === CONDUIT.valveOpen) {
    return command(grid, 'toggleValve', { cell });
  }
  return undefined;
}

/** What E sends this frame, and the tick work was last sent on: -1 when none is under way. */
export interface Uses {
  readonly commands: readonly Command[];
  readonly workedOnTick: number;
}

/** How many ticks of work one frame sends at most, after a stall. */
const MAX_WORK_PER_FRAME = 5;

/**
 * What E does this frame. A press toggles a door or valve within reach. Held on a plan the sim
 * would take, it sends one `work` for every tick released since the last it sent for, so a peer
 * drawing fewer frames than the ticks it runs builds as fast as any other; a hold just begun sends
 * one. `tick` is the client's world tick.
 */
export function usesOf(
  aim: Aim | undefined,
  e: { readonly pressed: boolean; readonly held: boolean },
  tick: number,
  workedOnTick: number,
): Uses {
  if (!aim?.inReach) return { commands: [], workedOnTick: -1 };
  const commands: Command[] = [];
  if (e.pressed && aim.toggle) commands.push(aim.toggle);
  if (!aim.work || aim.work.problem || !e.held) return { commands, workedOnTick: -1 };
  // A hold just begun sends one; so does a load that took the world's tick back.
  const fresh = workedOnTick < 0 || tick < workedOnTick;
  const due = fresh ? 1 : Math.min(tick - workedOnTick, MAX_WORK_PER_FRAME);
  for (let i = 0; i < due; i++) commands.push(command(building, 'work', { plan: aim.work.plan }));
  return { commands, workedOnTick: due > 0 ? tick : workedOnTick };
}
