import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { ItemsState } from './state';

/**
 * Switches creative mode, mostly off: on half the time, no inventory ever runs low and the refusals
 * for lack of items are never drawn. It has no refusals of its own.
 */
export function fuzzItems(_state: DeepReadonly<ItemsState>, rng: Rng) {
  return { type: 'setCreative', payload: { on: rng.below(4) === 0 } } as const;
}
