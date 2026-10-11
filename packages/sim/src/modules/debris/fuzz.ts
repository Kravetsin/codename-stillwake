import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { DebrisState } from './index';

/**
 * Grabs a piece that is out most of the time, else one already gone or never spawned. Most grabs are
 * refused, as few fuzzed heroes stand in space; those that are not take the piece.
 */
export function fuzzDebris(state: DeepReadonly<DebrisState>, rng: Rng) {
  const out = state.pieces;
  const piece =
    out.length > 0 && rng.below(4) !== 0
      ? (out[rng.below(out.length)]?.id ?? 0)
      : rng.below(state.nextId + 2);
  return { type: 'grab', payload: { piece } } as const;
}
