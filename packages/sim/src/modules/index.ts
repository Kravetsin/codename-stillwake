import { WRECK } from '@stillwake/content';
import { parseLayout } from '../core/layout';
import type { AnyModule } from '../core/module';
import { defineSim } from '../core/sim';
// `pnpm new:module` adds a module's import below this line and its id to MODULES.
import { grid } from './grid';

/** Every gameplay module. Registration order only breaks ties; dependencies decide the rest. */
export const MODULES: readonly AnyModule[] = [grid];

export const stillwake = defineSim(MODULES);

/** The map every new game starts from. */
export const wreck = parseLayout(WRECK);
export { CONDUIT, STRUCTURE } from './grid';
export { grid };
