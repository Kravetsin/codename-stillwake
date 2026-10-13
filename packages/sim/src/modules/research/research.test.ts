import { RESEARCH, SCHEMATICS, START_KNOWN, UNLOCKS } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseLayout, type Layout } from '../../core/layout';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import { building, grid, items, power, stillwake as world } from '../index';
import { BLUEPRINTS, research } from './index';

/**
 * Ten wide, knowing `known` or, `'all'`, everything: a solar panel out in space cabled to an
 * analyzer in a room, and, when `generator`, to a generator beside it drawing as well.
 */
function map(known: readonly string[] | 'all' = START_KNOWN, generator = false): Layout {
  const rows = [
    'PPP       ',
    '          ',
    '##########',
    `#AA${generator ? 'GG' : '..'}....#`,
    `#AA${generator ? 'GG' : '..'}....#`,
    '##########',
  ];
  const cables = [
    [
      { x: 0, y: 0 },
      { x: 1, y: 3 },
    ],
    ...(generator
      ? [
          [
            { x: 0, y: 0 },
            { x: 3, y: 3 },
          ] as const,
        ]
      : []),
  ] as const;
  const layout = parseLayout(rows, undefined, cables);
  return known === 'all' ? layout : { ...layout, known };
}
const ANALYZER = 3 * 10 + 1;
const WORK = RESEARCH.ticks * 1000;

/** The world on `layout`, a peer 0 carrying iron, scrap and schematics, and the analyzer's id. */
function setUp(layout = map()) {
  const w = giveItems(scenario(world, layout), 0, { iron: 5, scrap: 5, schematic: 3 });
  return { w, id: w.query(grid).machineAt(ANALYZER)?.id ?? 0 };
}
/** Puts one of `item` from peer 0 into analyzer `id`. */
function put(w: Scenario, id: number, item: string) {
  const slot = w
    .query(items)
    .inventory(0)
    .findIndex((s) => s?.item === item);
  return w.do(items, 'move', { src: { slot }, dst: { crate: id }, count: 1 }).run();
}
const takeOut = (w: Scenario, id: number) =>
  w.do(items, 'move', { src: { crate: id, slot: 0 }, dst: {}, count: 99 }).run();
const known = (w: Scenario) => w.query(research).known();

describe('research', () => {
  it('learns what a material teaches in its ticks at full power, and keeps the material', () => {
    const { w, id } = setUp();
    put(w, id, 'iron');
    // The tick of the move was the first of the work.
    w.run(RESEARCH.ticks - 2);
    expect(w.query(research).at(id)).toMatchObject({
      item: 'iron',
      progress: WORK - 1000,
      work: WORK,
      problem: undefined,
    });
    expect(known(w)).not.toContain('wallIron');
    w.run();
    for (const id of UNLOCKS.iron) expect(known(w)).toContain(id);
    expect(known(w)).toEqual([...known(w)].sort());
    expect(w.query(items).crate(id)[0]).toEqual({ item: 'iron', count: 1 });
    expect(w.query(research).at(id)?.problem).toBe('research.nothingNew');
  });

  it('learns from a schematic the next machine not known, the schematic used up', () => {
    const { w, id } = setUp();
    put(w, id, 'schematic');
    w.run(RESEARCH.ticks - 1);
    expect(known(w)).toContain(SCHEMATICS[0]);
    expect(known(w)).not.toContain(SCHEMATICS[1]);
    expect(w.query(items).crate(id)[0]).toBeNull();
    put(w, id, 'schematic');
    w.run(RESEARCH.ticks - 1);
    expect(known(w)).toContain(SCHEMATICS[1]);
  });

  it('stands with nothing new to teach, using nothing up and drawing no power', () => {
    const { w, id } = setUp(map('all'));
    expect(w.query(power).networks()[0]?.demand).toBe(0);
    put(w, id, 'schematic');
    w.run(2 * RESEARCH.ticks);
    expect(w.query(research).at(id)).toMatchObject({ progress: 0, problem: 'research.nothingNew' });
    expect(w.query(items).crate(id)[0]).toEqual({ item: 'schematic', count: 1 });
    expect(w.query(power).networks()[0]?.demand).toBe(0);
  });

  it('draws power while it learns, and none once it has learned what is in it', () => {
    const { w, id } = setUp();
    put(w, id, 'iron');
    expect(w.query(power).networks()[0]?.demand).toBe(2);
    w.run(RESEARCH.ticks);
    expect(known(w)).toContain(UNLOCKS.iron[0]);
    expect(w.query(items).crate(id)[0]?.item).toBe('iron');
    expect(w.query(power).networks()[0]?.demand).toBe(0);
    takeOut(w, id);
    put(w, id, 'scrap');
    w.run(1);
    expect(w.query(power).networks()[0]?.demand).toBe(2);
  });

  it('stalls unpowered, saying so, and works proportionally slower short of power', () => {
    const { w, id } = setUp();
    w.do(power, 'cut', { a: 0, b: ANALYZER }).run();
    put(w, id, 'iron');
    w.run(50);
    expect(w.query(research).at(id)).toMatchObject({ progress: 0, problem: 'research.unpowered' });

    // With a generator on the panel too, 5 against 6: each at 833‰.
    const short = setUp(map(START_KNOWN, true));
    put(short.w, short.id, 'iron');
    expect(short.w.query(power).satisfaction(short.id)).toBe(833);
    short.w.run(Math.ceil(WORK / 833) - 2);
    expect(known(short.w)).not.toContain('wallIron');
    short.w.run();
    expect(known(short.w)).toContain('wallIron');
  });

  it('starts over on what is taken out before it is learned', () => {
    const { w, id } = setUp();
    put(w, id, 'iron');
    w.run(50);
    takeOut(w, id);
    expect(w.query(research).at(id)).toBeUndefined();
    put(w, id, 'iron');
    expect(w.query(research).at(id)?.progress).toBe(1000);
  });

  it('refuses a plan for a blueprint not known, but in creative mode', () => {
    const { w } = setUp();
    const wall = { layer: 'structure', kind: 'wall', material: 'iron' } as const;
    w.do(building, 'placePlan', { cell: 3 * 10 + 6, placement: wall }).run();
    expect(w.refusals).toEqual(['building.unknown']);
    expect(w.query(building).problem(3 * 10 + 6, { place: wall })).toBe('building.unknown');
    w.do(items, 'setCreative', { on: true }).run();
    w.do(building, 'placePlan', { cell: 3 * 10 + 6, placement: wall }).run();
    expect(w.refusals).toEqual(['building.unknown']);
    expect(w.query(building).plans()).toHaveLength(1);
  });

  it('knows every blueprint on a map that names none', () => {
    const { w } = setUp(map('all'));
    expect(known(w)).toEqual(BLUEPRINTS.map((b) => b.id).sort());
  });

  it('only ever learns, and only blueprints there are, whatever goes in and out', () => {
    const ids = new Set(BLUEPRINTS.map((b) => b.id));
    const step = fc.oneof(
      fc.record({ put: fc.constantFrom('iron', 'scrap', 'schematic') }),
      fc.record({ out: fc.constant(true) }),
      fc.record({ run: fc.integer({ min: 1, max: 2 * RESEARCH.ticks }) }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 25 }), (steps) => {
        const { w, id } = setUp();
        w.run();
        let before = [...known(w)];
        for (const s of steps) {
          if ('put' in s) put(w, id, s.put);
          else if ('out' in s) takeOut(w, id);
          else w.run(s.run);
          const now = known(w);
          if (!before.every((k) => now.includes(k))) return false;
          if (!now.every((k) => ids.has(k))) return false;
          if (new Set(now).size !== now.length) return false;
          before = [...now];
        }
        return true;
      }),
      { numRuns: 40 },
    );
  });
});
