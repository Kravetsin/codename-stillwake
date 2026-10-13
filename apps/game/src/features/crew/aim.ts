import { DEBRIS, HERO, MACHINES, type MachineKind, type MachineSpec } from '@stillwake/content';
import {
  atmosphere,
  building,
  command,
  debris,
  CONDUIT,
  grid,
  rooms,
  STRUCTURE,
  type Command,
  type Sim,
} from '@stillwake/sim';
import { bodyCell, UNIT, type Hero } from './hero';

/** Something E does: the command it sends, and why the sim would refuse it, if it would. */
export interface Use {
  readonly command: Command;
  readonly problem: string | undefined;
}

/**
 * The cell under the pointer and what the hands do there: the left button held works a plan; E
 * toggles a door or valve, puts a canister into a tank, grabs a piece of debris or opens crate
 * `crate`. `piece` names the piece of debris a press grabs, which is outlined itself, not its cell.
 */
export interface Aim {
  readonly cell: number;
  readonly inReach: boolean;
  readonly press?: Use;
  /** A plan the left button works on; `delivers` while it still lacks something, not building. */
  readonly work?: {
    readonly plan: number;
    readonly problem: string | undefined;
    readonly delivers?: boolean;
  };
  readonly crate?: number;
  readonly piece?: number;
}

/** Whether the middle of `cell` is within the hero's reach of the middle of its body. */
export function reaches(hero: Hero, cell: number, width: number): boolean {
  const dx = (cell % width) * UNIT + UNIT / 2 - hero.x;
  const dy = Math.floor(cell / width) * UNIT + UNIT / 2 - (hero.y - HERO.height / 2);
  return dx * dx + dy * dy <= HERO.reach * HERO.reach;
}

/** Whether a machine of `kind` holds items, opened with E: a crate, a furnace. */
const holdsItems = (kind: MachineKind) => (MACHINES[kind] as MachineSpec).slots !== undefined;

/** Whether crate or furnace `id` still stands with a cell of it within the hero's reach. */
export function crateInReach(sim: Sim, hero: Hero, id: number): boolean {
  const q = sim.query(grid);
  const crate = q.machines().find((m) => m.id === id && holdsItems(m.kind));
  const cells = crate ? (q.footprint(crate.kind, crate.cell) ?? []) : [];
  return cells.some((cell) => reaches(hero, cell, q.size().width));
}

/**
 * What the hero of peer `peer` aims at with the pointer at `point`, in cells; nothing off the grid.
 * A plan in the cell is worked: of several, the oldest that can be worked, so one the hero cannot
 * pay for does not block the mark beside it; when none can, the oldest, to show why; none in
 * `served`, served in this hold already. E works what is under it all the same: a crate or a
 * furnace, a tank, a door, a valve; a valve under a machine or in a door's cell is not worked with
 * E. With neither, the piece of debris
 * nearest the pointer within `DEBRIS.aimRadius`, only while the hero is out in space, where it can
 * catch one, and none in `passOver`: grabbed already, its grab still in flight.
 */
export function aimAt(
  sim: Sim,
  peer: number,
  hero: Hero,
  point: { x: number; y: number },
  passOver: ReadonlySet<number> = new Set(),
  served: ReadonlySet<number> = new Set(),
): Aim | undefined {
  const cells = sim.query(grid).layers();
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= cells.width || y >= cells.height) return undefined;
  const cell = y * cells.width + x;
  const inReach = reaches(hero, cell, cells.width);

  const plans = sim.query(building);
  const delivers = (id: number) => Object.keys(plans.lacking(id)).length > 0;
  const here = plans
    .plansAt(cell)
    // A sweep delivers to each blueprint once; one with all it needs is built while held on.
    .filter((p) => !(served.has(p.id) && delivers(p.id)))
    .map((p) => ({
      plan: p.id,
      problem: plans.workProblem(p.id, peer),
      ...(delivers(p.id) ? { delivers: true } : {}),
    }));
  const work = here.find((w) => !w.problem) ?? here[0];
  const machine = sim.query(grid).machineAt(cell);
  const press = pressOf(sim, peer, cell);
  const under =
    machine && holdsItems(machine.kind) ? { crate: machine.id } : press ? { press } : undefined;
  if (work || under) return { cell, inReach, ...(work ? { work } : {}), ...under };
  const piece = pieceNear(sim, hero, point, passOver);
  if (!piece) return { cell, inReach };
  // Aimed at where the piece is, which may be a cell beside the pointer's.
  const at = Math.floor(piece.y / UNIT) * cells.width + Math.floor(piece.x / UNIT);
  return {
    cell: at,
    inReach: reaches(hero, at, cells.width),
    piece: piece.id,
    press: {
      command: command(debris, 'grab', { piece: piece.id }),
      problem: sim.query(debris).grabProblem(peer, piece.id),
    },
  };
}

/** The piece of debris nearest `point` within `DEBRIS.aimRadius`; none while the hero is aboard. */
function pieceNear(
  sim: Sim,
  hero: Hero,
  point: { x: number; y: number },
  passOver: ReadonlySet<number>,
) {
  const { width } = sim.query(grid).size();
  if (sim.query(rooms).roomAt(bodyCell(hero, width)) !== 'space') return undefined;
  let nearest: { readonly id: number; readonly x: number; readonly y: number } | undefined;
  let best = DEBRIS.aimRadius * DEBRIS.aimRadius;
  for (const p of sim.query(debris).pieces()) {
    if (passOver.has(p.id)) continue;
    const dx = p.x - point.x * UNIT;
    const dy = p.y - point.y * UNIT;
    if (dx * dx + dy * dy > best) continue;
    best = dx * dx + dy * dy;
    nearest = p;
  }
  return nearest;
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

/**
 * What the hands send this frame, the crate they open if any, the blueprint they delivered to if
 * any, and the tick work was last sent on: -1 when none is under way.
 */
export interface Uses {
  readonly commands: readonly Command[];
  readonly open?: number;
  readonly served?: number;
  readonly workedOnTick: number;
}

/** How many ticks of work one frame sends at most, after a stall. */
const MAX_WORK_PER_FRAME = 5;

/**
 * What the hands do this frame: `pressed` is E, or the left button on a piece of debris; `held` the
 * left button. A press within reach sends what is pressed, unless the sim would refuse it. Held on a
 * blueprint still lacking something, it delivers once: the caller keeps the blueprints
 * served in this hold and passes them to `aimAt`, so sweeping the pointer delivers to each it passes.
 * Held on a plan with all it needs, or a mark, it sends one `work` for every tick released since the
 * last it sent for, so a peer drawing fewer frames than the ticks it runs builds as fast as any other;
 * a hold just begun sends one. `tick` is the client's world tick.
 */
export function usesOf(
  aim: Aim | undefined,
  hands: { readonly pressed: boolean; readonly held: boolean },
  tick: number,
  workedOnTick: number,
): Uses {
  if (!aim?.inReach) return { commands: [], workedOnTick: -1 };
  if (hands.pressed && aim.crate !== undefined) {
    return { commands: [], open: aim.crate, workedOnTick: -1 };
  }
  const commands: Command[] = [];
  if (hands.pressed && aim.press && !aim.press.problem) commands.push(aim.press.command);
  if (!aim.work || aim.work.problem || !hands.held) return { commands, workedOnTick: -1 };
  const work = command(building, 'work', { plan: aim.work.plan });
  if (aim.work.delivers)
    return { commands: [...commands, work], served: aim.work.plan, workedOnTick: -1 };
  // A hold just begun sends one; so does a load that took the world's tick back.
  const fresh = workedOnTick < 0 || tick < workedOnTick;
  const due = fresh ? 1 : Math.min(tick - workedOnTick, MAX_WORK_PER_FRAME);
  for (let i = 0; i < due; i++) commands.push(work);
  return { commands, workedOnTick: due > 0 ? tick : workedOnTick };
}
