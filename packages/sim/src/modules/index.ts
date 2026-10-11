import { WRECK, WRECK_UNDER } from '@stillwake/content';
import { parseLayout } from '../core/layout';
import type { AnyModule } from '../core/module';
import { defineSim } from '../core/sim';
// `pnpm new:module` adds a module's import below this line and its id to MODULES.
import { atmosphere } from './atmosphere';
import { building } from './building';
import { crew } from './crew';
import { grid } from './grid';
import { hazards } from './hazards';
import { pipes } from './pipes';
import { rooms } from './rooms';
import { stock } from './stock';

/** Every gameplay module. Registration order only breaks ties; dependencies decide the rest. */
export const MODULES: readonly AnyModule[] = [
  grid,
  building,
  stock,
  rooms,
  pipes,
  atmosphere,
  crew,
  hazards,
];

export const stillwake = defineSim(MODULES);

/** The map every new game starts from. */
export const wreck = parseLayout(WRECK, WRECK_UNDER);
export { CONDUIT, STRUCTURE } from './grid';
export type { Layer, Placement } from './grid';
export { grid };
export { building };
export type { Action, Plan } from './building';
export { stock };
export type { Cost, Item } from './stock';
export { rooms };
export { pipes };
export { atmosphere };
export type { RoomAir, RoomStatus } from './atmosphere';
export { crew };
export { hazards };
