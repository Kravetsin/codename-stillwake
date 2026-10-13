import { POWER, WRECK } from '@stillwake/content';
import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { PowerState } from './index';

// The module cannot see the grid. The generic suites fuzz it on the wreck, so ends are drawn mostly
// from the cells where it has something built, near one another, and now and then anywhere.
const WIDTH = WRECK[0]?.length ?? 0;
const CELLS = WIDTH * WRECK.length;
const BUILT: readonly number[] = WRECK.flatMap((row, y) =>
  [...row].flatMap((char, x) => (char === ' ' ? [] : [y * WIDTH + x])),
);
const SPAN = POWER.maxSpan + 3;

/**
 * Lays cables between built cells a few apart, a cell anywhere now and then (refused as no node or too
 * long); moves the ends at a node, or one cable's, to a cell near or anywhere (refused as taut, no
 * node, no cable there or twice); and cuts one already laid or a pair never cabled.
 */
export function fuzzPower(state: DeepReadonly<PowerState>, rng: Rng) {
  if (state.cables.length > 0 && rng.below(3) === 0) {
    const cable = state.cables[rng.below(state.cables.length)];
    const from =
      rng.below(6) === 0 || !cable ? rng.below(CELLS) : rng.below(2) === 0 ? cable.a : cable.b;
    const to = from + (rng.below(SPAN) - (SPAN >> 1)) + WIDTH * (rng.below(SPAN) - (SPAN >> 1));
    const one = cable && rng.below(2) === 0 ? { cable: { a: cable.a, b: cable.b } } : {};
    return {
      type: 'move',
      payload: { from, to: rng.below(8) === 0 ? rng.below(CELLS) : to, ...one },
    } as const;
  }
  if (state.cables.length > 0 && rng.below(3) === 0) {
    const cable = state.cables[rng.below(state.cables.length)];
    const pair =
      rng.below(5) === 0 || !cable ? { a: rng.below(CELLS), b: rng.below(CELLS) } : cable;
    return { type: 'cut', payload: { a: pair.a, b: pair.b } } as const;
  }
  const a = rng.below(8) === 0 ? rng.below(CELLS) : (BUILT[rng.below(BUILT.length)] ?? 0);
  const near = a + (rng.below(SPAN) - (SPAN >> 1)) + WIDTH * (rng.below(SPAN) - (SPAN >> 1));
  const b = rng.below(8) === 0 ? rng.below(CELLS) : near;
  return { type: 'lay', payload: { a, b } } as const;
}
