import { describe, expect, it } from 'vitest';
import { command, defineSim, SAVE_FORMAT, type Command, type SimDefinition } from './sim';
import { crew, dice, ledger, tanks, TWO_TANKS } from './test-modules';

const def = defineSim([crew, tanks, dice, ledger]);

const opening: Command[] = [
  command(tanks, 'fill', { cell: 0, amount: 6 }),
  command(tanks, 'fill', { cell: 1, amount: 3 }),
  command(crew, 'join', { cell: 0 }),
  command(ledger, 'add', { value: 7 }),
  command(ledger, 'add', { value: 7 }),
  command(ledger, 'add', { value: 2 }),
];

const later: Command[] = [command(crew, 'join', { cell: 1 }), command(ledger, 'add', { value: 7 })];

/**
 * Plays a world, saves it, loads the save, then plays both on with the same commands. Comparing
 * only right after the load would miss a bad rebuild of derived state; playing on shows it.
 */
function reloadMidway(definition: SimDefinition, seed: number) {
  const played = definition.create(seed, TWO_TANKS);
  played.step(opening);
  for (let i = 0; i < 5; i++) played.step([]);

  const loaded = definition.load(played.save());
  const atLoad = [played.hash(), loaded.hash()];

  for (const sim of [played, loaded]) {
    sim.step(later);
    for (let i = 0; i < 20; i++) sim.step([]);
  }
  return { played, loaded, atLoad };
}

describe('save and load', () => {
  it('gives the same world back, and it plays on the same', () => {
    const { played, loaded, atLoad } = reloadMidway(def, 99);
    expect(atLoad[1]).toBe(atLoad[0]);
    expect(loaded.hash()).toBe(played.hash());
    expect(loaded.world).toEqual(played.world);
  });

  it('rebuilds derived state instead of saving it', () => {
    const sim = def.create(1, TWO_TANKS);
    sim.step(opening);
    const text = sim.save();

    expect(text).not.toContain('counts');
    expect(def.load(text).query(ledger).count(7)).toBe(2);
  });

  it('leaves derived state out of the hash', () => {
    const sim = def.create(1, TWO_TANKS);
    sim.step(opening);
    const before = sim.hash();
    (sim.world.slices['ledger'] as { counts: Map<number, number> }).counts.clear();
    expect(sim.hash()).toBe(before);
  });

  it('writes the same text for the same world', () => {
    const [a, b] = [def.create(5, TWO_TANKS), def.create(5, TWO_TANKS)];
    a.step(opening);
    b.step(opening);
    expect(a.save()).toBe(b.save());
  });

  it('keeps the random sequence going where it left off', () => {
    const played = def.create(3, TWO_TANKS);
    for (let i = 0; i < 4; i++) played.step([]);
    const loaded = def.load(played.save());
    played.step([]);
    loaded.step([]);
    expect(loaded.world.slices['dice']).toEqual(played.world.slices['dice']);
  });
});

describe('refusing saves it cannot read', () => {
  const save = () => def.create(1, TWO_TANKS).save();
  const edit = (
    f: (file: { format: number; world: { slices: Record<string, unknown> } }) => void,
  ) => {
    const file = JSON.parse(save()) as {
      format: number;
      world: { slices: Record<string, unknown> };
    };
    f(file);
    return JSON.stringify(file);
  };

  it('refuses another format', () => {
    const text = edit((f) => (f.format = SAVE_FORMAT + 1));
    expect(() => def.load(text)).toThrow(
      `A save of format ${SAVE_FORMAT + 1} cannot be loaded by format ${SAVE_FORMAT}.`,
    );
  });

  it('refuses a save from another set of modules, naming the difference', () => {
    const text = edit((f) => {
      delete f.world.slices['dice'];
      f.world.slices['planets'] = {};
    });
    expect(() => def.load(text)).toThrow(
      'The save does not fit these modules (extra: planets; missing: dice).',
    );
  });

  it('refuses a save without a valid world', () => {
    const text = JSON.stringify({ format: SAVE_FORMAT, world: { tick: 'soon' } });
    expect(() => def.load(text)).toThrow('The save holds no valid world.');
  });
});
