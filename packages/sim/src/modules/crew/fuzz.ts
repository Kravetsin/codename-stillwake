import { CREW } from '@stillwake/content';
import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { CrewState } from './index';

/**
 * Moves heroes about: mostly near the spawn, where the rooms are, now and then anywhere or off the
 * grid. The desync fuzz sends from several clients, so several heroes come and go. Now and then a
 * hero picks a suit colour, one past the last now and then, so taken and missing colours are refused,
 * and rarely one leaves.
 */
export function fuzzCrew(state: DeepReadonly<CrewState>, rng: Rng) {
  if (rng.below(200) === 0) return { type: 'leave', payload: {} } as const;
  if (rng.below(5) === 0) {
    return { type: 'pickColour', payload: { colour: rng.below(CREW.colours + 1) } } as const;
  }
  const cell = rng.below(4) !== 0 ? state.spawn + rng.below(9) - 4 : rng.below(1100) - 50;
  return { type: 'enter', payload: { cell } } as const;
}
