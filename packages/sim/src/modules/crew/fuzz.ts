import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { CrewState } from './index';

/**
 * Moves heroes about: mostly near the spawn, where the rooms are, now and then anywhere or off the
 * grid. The desync fuzz sends from several clients, so several heroes come and go.
 */
export function fuzzCrew(state: DeepReadonly<CrewState>, rng: Rng) {
  const cell = rng.below(4) !== 0 ? state.spawn + rng.below(9) - 4 : rng.below(1100) - 50;
  return { type: 'enter', payload: { cell } } as const;
}
