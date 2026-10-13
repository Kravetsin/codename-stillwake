import { atmosphereFeature } from './atmosphere';
import { crewFeature } from './crew';
import { devPanel } from './dev-panel';
import type { Feature } from './feature';
// `pnpm new:module <name> --client` adds a feature's import below this line and its id to FEATURES.
import { debrisFeature } from './debris';
import { itemsFeature } from './items';
import { buildingFeature } from './building';
import { gridFeature } from './grid';
import { pipesFeature } from './pipes';
import { powerFeature } from './power';
import { furnaceFeature } from './furnace';
import { effectsFeature } from './effects';
import { lightFeature } from './light';

/** Every client feature. Layers stack in this order; panels render in this order. */
export const FEATURES: readonly Feature[] = [
  // Behind the hull: stars and debris show only where the ship is not.
  debrisFeature,
  gridFeature,
  pipesFeature,
  // Cables over the pipes, hanging in front of the back walls.
  powerFeature,
  // Stacks lying on the floor, under the heroes walking over them.
  itemsFeature,
  // Fire in a furnace's mouth, under a hero standing before it.
  furnaceFeature,
  crewFeature,
  // The dark over the ship and what it holds; what explains the ship stays above it.
  lightFeature,
  atmosphereFeature,
  buildingFeature,
  // Dust, sparks, embers and air over everything in the world, plans included.
  effectsFeature,
  devPanel,
];
