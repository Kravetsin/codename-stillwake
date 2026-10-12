import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { AtmosphereState } from './index';

/**
 * Puts canisters into machines by id. The module cannot see the grid's machines; on the wreck
 * machine 1 is the generator, which refuses them as no tank, and low ids now and then reach a tank
 * the building fuzz put up: those fill, then refuse for a full tank or a sender out of canisters.
 */
export function fuzzAtmosphere(_state: DeepReadonly<AtmosphereState>, rng: Rng) {
  const tank = rng.below(4) !== 0 ? 1 : rng.below(6);
  return { type: 'loadCanister', payload: { tank } } as const;
}
