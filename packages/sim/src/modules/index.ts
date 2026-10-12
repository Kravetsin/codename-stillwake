import { WRECK, WRECK_CABLES, WRECK_UNDER } from '@stillwake/content';
import { parseLayout } from '../core/layout';
import type { AnyModule } from '../core/module';
import { defineSim } from '../core/sim';
// `pnpm new:module` adds a module's import below this line and its id to MODULES.
import { power } from './power';
import { debris } from './debris';
import { atmosphere } from './atmosphere';
import { building } from './building';
import { crew } from './crew';
import { grid } from './grid';
import { hazards } from './hazards';
import { items } from './items';
import { pipes } from './pipes';
import { rooms } from './rooms';

/** Every gameplay module. Registration order only breaks ties; dependencies decide the rest. */
export const MODULES: readonly AnyModule[] = [
  grid,
  building,
  items,
  rooms,
  pipes,
  power,
  atmosphere,
  crew,
  hazards,
  debris,
];

export const stillwake = defineSim(MODULES);

/** The map every new game starts from. */
export const wreck = parseLayout(WRECK, WRECK_UNDER, WRECK_CABLES);
export { BACK, CONDUIT, STRUCTURE } from './grid';
export type { Layer, Placement, Toggle } from './grid';
export { grid };
export { building };
export type { Action, Plan } from './building';
export { items };
export type { Cost, Drop, FloorStack, Item, Move, Place, Slot, Stack, Target } from './items';
export { rooms };
export { pipes };
export { atmosphere };
export type { RoomAir, RoomStatus } from './atmosphere';
export { crew };
export { hazards };
export { debris };
export type { Piece } from './debris';
export { power };
export type { Cable, PowerNetwork } from './power';
