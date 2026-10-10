import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { StockState } from './state';

/** Switches creative mode on or off; it has no refusals to draw. */
export function fuzzStock(_state: DeepReadonly<StockState>, rng: Rng) {
  return { type: 'setCreative', payload: { on: rng.below(2) === 0 } } as const;
}
