import { backdrop } from './backdrop';
import { devPanel } from './dev-panel';
import type { Feature } from './feature';
// `pnpm new:module <name> --client` adds a feature's import below this line and its id to FEATURES.
import { gridFeature } from './grid';

/** Every client feature. Layers stack in this order; panels render in this order. */
export const FEATURES: readonly Feature[] = [backdrop, gridFeature, devPanel];
