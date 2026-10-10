import type { AnyModule } from '../core/module';
import { defineSim } from '../core/sim';
// `pnpm new:module` adds a module's import below this line and its id to MODULES.
import { grid } from './grid';

/** Every gameplay module. Registration order only breaks ties; dependencies decide the rest. */
export const MODULES: readonly AnyModule[] = [grid];

export const stillwake = defineSim(MODULES);
export { grid };
