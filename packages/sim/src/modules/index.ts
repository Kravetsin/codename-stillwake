import type { AnyModule } from '../core/module';
import { defineSim } from '../core/sim';

/** Every gameplay module. Registration order only breaks ties; dependencies decide the rest. */
export const MODULES: readonly AnyModule[] = [];

export const stillwake = defineSim(MODULES);
