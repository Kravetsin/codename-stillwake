import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineSim } from '../core/sim';
import { crew, tanks } from '../core/test-modules';
import { scenario } from './scenario';

const air = defineSim([crew, tanks]);

describe('scenarios read like the situation they test', () => {
  it('a hero joins at a tank, breathes it dry, then gasps', () => {
    const w = scenario(
      air,
      `
      #####
      #T..#
      #####
      `,
    );
    const tank = w.cell('T');

    w.do(tanks, 'fill', { cell: tank, amount: 2 }).do(crew, 'join', { cell: tank }).run();
    expect(w.query(tanks).level(tank)).toBe(1);

    w.run();
    expect(w.events).toContainEqual({ module: 'tanks', type: 'emptied', payload: { cell: tank } });

    w.run(2);
    expect(w.query(crew).air(0)).toBe(1);
    expect(w.events.filter((e) => e.type === 'gasping')).toHaveLength(2);
  });

  it('nobody joins at a tank with no air, and the refusal says why', () => {
    const w = scenario(air, `#T#`);
    w.do(crew, 'join', { cell: w.cell('T') }).run();
    expect(w.refusals).toEqual(['crew.noAir']);
  });

  it('two tanks are told apart by where they stand', () => {
    const w = scenario(air, `T.T`);
    const [left, right] = w.cells('T') as [number, number];
    w.do(tanks, 'fill', { cell: right, amount: 4 }).run();
    expect([w.query(tanks).level(left), w.query(tanks).level(right)]).toEqual([0, 4]);
  });

  it('asks for exactly one cell when a test means one', () => {
    expect(() => scenario(air, `T.T`).cell('T')).toThrow(
      "The map has 2 cells drawn with 'T', not one.",
    );
  });
});

describe('invariants hold for any command sequence', () => {
  it('no tank ever holds less than nothing or more than its capacity', () => {
    const fill = fc.record({
      cell: fc.integer({ min: -1, max: 3 }),
      amount: fc.integer({ min: -5, max: 15 }),
    });
    fc.assert(
      fc.property(fc.array(fc.array(fill, { maxLength: 4 }), { maxLength: 30 }), (ticks) => {
        const w = scenario(air, `T.T`);
        for (const fills of ticks) {
          for (const f of fills) w.do(tanks, 'fill', f);
          w.run();
          for (const cell of w.cells('T')) {
            const level = w.query(tanks).level(cell);
            if (level < 0 || level > 10) return false;
          }
        }
        return true;
      }),
    );
  });
});
