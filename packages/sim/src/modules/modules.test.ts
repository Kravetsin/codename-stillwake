// Generic suite: holds for every module in MODULES without a test of its own.
import { describe, expect, it } from 'vitest';
import type { AnyModule } from '../core/module';
import { createRng, type Rng } from '../core/rng';
import type { Command, Sim } from '../core/sim';
import { stillwake, wreck } from './index';

type Fuzz = (state: unknown, rng: Rng) => { type: string; payload: unknown } | undefined;

/** Up to three random commands drawn from the modules' own fuzz generators. */
function randomCommands(sim: Sim, rng: Rng): Command[] {
  const fuzzable = stillwake.modules.filter((m) => m.fuzz);
  const commands: Command[] = [];
  for (let n = fuzzable.length > 0 ? rng.below(4) : 0; n > 0; n--) {
    const m = fuzzable[rng.below(fuzzable.length)] as AnyModule;
    const pick = (m.fuzz as Fuzz)(sim.world.slices[m.id], rng);
    if (pick) commands.push({ module: m.id, type: pick.type, payload: pick.payload });
  }
  return commands;
}

describe('every registered module, on the starting wreck', () => {
  it.each([1, 7, 2026])('saves, loads and plays on the same (seed %i)', (seed) => {
    const rng = createRng(seed);
    const played = stillwake.create(seed, wreck);
    for (let i = 0; i < 100; i++) played.step(randomCommands(played, rng));

    const loaded = stillwake.load(played.save());
    expect(loaded.hash()).toBe(played.hash());

    for (let i = 0; i < 100; i++) {
      const commands = randomCommands(played, rng);
      played.step(commands);
      loaded.step(commands);
    }
    expect(loaded.hash()).toBe(played.hash());
  });
});
