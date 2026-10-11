import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { AtmosphereState } from './index';

/**
 * Puts canisters into machines by id. The module cannot see the grid's machines; the wreck's tank is
 * machine 1, so it gets most draws and fills, then refuses for a full tank or a sender out of
 * canisters. The rest go to low ids: the vent, a missing machine, now and then one that was built.
 */
export function fuzzAtmosphere(_state: DeepReadonly<AtmosphereState>, rng: Rng) {
  const tank = rng.below(4) !== 0 ? 1 : rng.below(6);
  return { type: 'loadCanister', payload: { tank } } as const;
}
