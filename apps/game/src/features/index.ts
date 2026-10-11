import { atmosphereFeature } from './atmosphere';
import { crewFeature } from './crew';
import { devPanel } from './dev-panel';
import type { Feature } from './feature';
// `pnpm new:module <name> --client` adds a feature's import below this line and its id to FEATURES.
import { stockFeature } from './stock';
import { buildingFeature } from './building';
import { gridFeature } from './grid';
import { pipesFeature } from './pipes';

/** Every client feature. Layers stack in this order; panels render in this order. */
export const FEATURES: readonly Feature[] = [
  gridFeature,
  atmosphereFeature,
  pipesFeature,
  crewFeature,
  buildingFeature,
  stockFeature,
  devPanel,
];
