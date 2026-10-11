import { building, grid, type Sim } from '@stillwake/sim';
import { createStore } from '../../session/store';
import type { Aim } from './aim';

/** What E does at the aim, as an i18n key, and why the sim would refuse it, if it would. */
export interface Prompt {
  readonly action: string;
  readonly problem: string | undefined;
}

/** The prompt at the bottom of the screen: set by the crew layer, read by its panel. */
export const shownPrompt = createStore<Prompt | undefined>(undefined);

/** What E would do at `aim` within reach, in words; nothing out of reach or with nothing to do. */
export function promptOf(sim: Sim, aim: Aim | undefined): Prompt | undefined {
  if (!aim?.inReach) return undefined;
  if (aim.work) {
    const plan = sim
      .query(building)
      .plans()
      .find((p) => p.id === aim.work?.plan);
    const action = plan && 'clear' in plan ? 'use.takeApart' : 'use.build';
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
      const door = sim.query(grid).structureAt(aim.cell);
      return {
        action: door.kind === 'door' && door.open ? 'use.closeDoor' : 'use.openDoor',
        problem,
      };
    }
    case 'grid.toggleValve': {
      const valve = sim.query(grid).conduitAt(aim.cell);
      const open = valve.kind === 'valve' && valve.open;
      return { action: open ? 'use.closeValve' : 'use.openValve', problem };
    }
    default:
      throw new Error(`No prompt for ${command.module}.${command.type}`);
  }
}

/** Two prompts that say the same. */
export const samePrompt = (a: Prompt | undefined, b: Prompt | undefined) =>
  a?.action === b?.action && a?.problem === b?.problem;
