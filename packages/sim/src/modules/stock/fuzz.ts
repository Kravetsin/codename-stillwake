import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { StockState } from './state';

/**
 * Switches creative mode, mostly off: on half the time, the stock never runs low and the refusals for
 * lack of it are never drawn. It has no refusals of its own.
 */
export function fuzzStock(_state: DeepReadonly<StockState>, rng: Rng) {
  return { type: 'setCreative', payload: { on: rng.below(4) === 0 } } as const;
}
