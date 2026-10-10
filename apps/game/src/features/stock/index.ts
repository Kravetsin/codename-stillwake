import type { Feature } from '../feature';
import { Counters } from './Counters';

/** The ship's stock, as counters on the screen. */
export const stockFeature: Feature = { id: 'stock', Panel: Counters };
