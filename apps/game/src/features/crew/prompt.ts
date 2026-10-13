import { building, CONDUIT, grid, STRUCTURE, type Sim } from '@stillwake/sim';
import { createStore } from '../../session/store';
import type { Aim } from './aim';

/** What E does at the aim, as an i18n key, and why the sim would refuse it, if it would. */
export interface Prompt {
  readonly action: string;
  readonly problem: string | undefined;
}

/** The prompt at the bottom of the screen: set by the crew layer, read by its panel. */
export const shownPrompt = createStore<Prompt | undefined>(undefined);

/**
 * What E would do at `aim` within reach, in words; nothing out of reach or with nothing to do. Doors
 * and valves are as `shown`: with this peer's own toggles in flight, the next press undoes them.
 */
export function promptOf(
  sim: Sim,
  aim: Aim | undefined,
  shown: { readonly structure: readonly number[]; readonly conduit: readonly number[] } = sim
    .query(grid)
    .layers(),
): Prompt | undefined {
  if (!aim?.inReach) return undefined;
  if (aim.work) {
    const plan = sim
      .query(building)
      .plans()
      .find((p) => p.id === aim.work?.plan);
    const action =
      plan && 'clear' in plan ? 'use.takeApart' : aim.work.delivers ? 'use.deliver' : 'use.build';
    return { action, problem: aim.work.problem };
  }
  if (aim.crate !== undefined) return { action: 'use.openCrate', problem: undefined };
  if (!aim.press) return undefined;
  const { command, problem } = aim.press;
  switch (`${command.module}.${command.type}`) {
    case 'atmosphere.loadCanister':
      return { action: 'use.loadCanister', problem };
    case 'debris.grab':
      return { action: 'use.catch', problem };
    case 'grid.toggleDoor': {
      const open = shown.structure[aim.cell] === STRUCTURE.doorOpen;
      return { action: open ? 'use.closeDoor' : 'use.openDoor', problem };
    }
    case 'grid.toggleValve': {
      const open = shown.conduit[aim.cell] === CONDUIT.valveOpen;
      return { action: open ? 'use.closeValve' : 'use.openValve', problem };
    }
    default:
      throw new Error(`No prompt for ${command.module}.${command.type}`);
  }
}

/** Two prompts that say the same. */
export const samePrompt = (a: Prompt | undefined, b: Prompt | undefined) =>
  a?.action === b?.action && a?.problem === b?.problem;
