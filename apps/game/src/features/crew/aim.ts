import { HERO } from '@stillwake/content';
import {
  atmosphere,
  building,
  command,
  CONDUIT,
  grid,
  STRUCTURE,
  type Command,
  type Sim,
} from '@stillwake/sim';
import { UNIT, type Hero } from './hero';

/** Something E does: the command it sends, and why the sim would refuse it, if it would. */
export interface Use {
  readonly command: Command;
  readonly problem: string | undefined;
}

/**
 * The cell under the pointer and what E does there: works a plan while held, or, when pressed,
 * toggles a door or valve or puts a canister into a tank.
 */
export interface Aim {
  readonly cell: number;
  readonly inReach: boolean;
  readonly press?: Use;
  readonly work?: { readonly plan: number; readonly problem: string | undefined };
}

/**
 * What the hero of peer `peer` aims at with the pointer at `point`, in cells; nothing off the grid.
 * A plan takes E before anything else in its cell, so a marked door is taken apart rather than
 * opened. Of several plans, the oldest that can be worked, so one the hero cannot pay for does not
 * block the mark beside it; when none can, the oldest, to show why. Then a tank, a door, a valve: a
 * valve under a tank or in a door's cell is not worked with E.
 */
export function aimAt(
  sim: Sim,
  peer: number,
  hero: Hero,
  point: { x: number; y: number },
): Aim | undefined {
  const cells = sim.query(grid).layers();
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= cells.width || y >= cells.height) return undefined;
  const cell = y * cells.width + x;
  const dx = x * UNIT + UNIT / 2 - hero.x;
  const dy = y * UNIT + UNIT / 2 - (hero.y - HERO.height / 2);
  const inReach = dx * dx + dy * dy <= HERO.reach * HERO.reach;

  const plans = sim.query(building);
  const here = plans
    .plansAt(cell)
    .map((p) => ({ plan: p.id, problem: plans.workProblem(p.id, peer) }));
  const work = here.find((w) => !w.problem) ?? here[0];
  if (work) return { cell, inReach, work };
  const press = pressOf(sim, peer, cell);
  return press ? { cell, inReach, press } : { cell, inReach };
}

function pressOf(sim: Sim, peer: number, cell: number): Use | undefined {
  const machine = sim.query(grid).machineAt(cell);
  if (machine?.kind === 'tank') {
    return {
      command: command(atmosphere, 'loadCanister', { tank: machine.id }),
      problem: sim.query(atmosphere).canisterProblem(machine.id, peer),
    };
  }
  const { structure, conduit } = sim.query(grid).layers();
  const s = structure[cell];
  if (s === STRUCTURE.doorClosed || s === STRUCTURE.doorOpen) {
    return { command: command(grid, 'toggleDoor', { cell }), problem: undefined };
  }
  const c = conduit[cell];
  if (c === CONDUIT.valveClosed || c === CONDUIT.valveOpen) {
    return { command: command(grid, 'toggleValve', { cell }), problem: undefined };
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
 * What E does this frame. A press within reach sends what is pressed, unless the sim would refuse
 * it. Held on a plan the sim would take, it sends one `work` for every tick released since the last
 * it sent for, so a peer drawing fewer frames than the ticks it runs builds as fast as any other; a
 * hold just begun sends one. `tick` is the client's world tick.
 */
export function usesOf(
  aim: Aim | undefined,
  e: { readonly pressed: boolean; readonly held: boolean },
  tick: number,
  workedOnTick: number,
): Uses {
  if (!aim?.inReach) return { commands: [], workedOnTick: -1 };
  const commands: Command[] = [];
  if (e.pressed && aim.press && !aim.press.problem) commands.push(aim.press.command);
  if (!aim.work || aim.work.problem || !e.held) return { commands, workedOnTick: -1 };
  // A hold just begun sends one; so does a load that took the world's tick back.
  const fresh = workedOnTick < 0 || tick < workedOnTick;
  const due = fresh ? 1 : Math.min(tick - workedOnTick, MAX_WORK_PER_FRAME);
  for (let i = 0; i < due; i++) commands.push(command(building, 'work', { plan: aim.work.plan }));
  return { commands, workedOnTick: due > 0 ? tick : workedOnTick };
}
