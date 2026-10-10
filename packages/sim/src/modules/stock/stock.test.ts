import { STARTING_STOCK } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineModule, refuse } from '../../core/module';
import { defineSim } from '../../core/sim';
import { scenario } from '../../testing/scenario';
import { stock, type Cost, type Item, type StockModule } from './index';

/** Stands in for `building` (P1-27): pays through the stock, refusing what it cannot pay. */
const spender = defineModule<[StockModule]>()({
  id: 'spender',
  dependsOn: ['stock'],
  init: () => ({}),
  commands: {
    buy: {
      validate(ctx, p: { cost: Cost }) {
        const why = ctx.deps.stock.query.shortOf(p.cost);
        if (why) return refuse(why);
      },
      apply(ctx, p: { cost: Cost }) {
        ctx.deps.stock.op.spend(p.cost);
      },
    },
    takeApart: {
      apply(ctx, p: { cost: Cost }) {
        ctx.deps.stock.op.refund(p.cost);
      },
    },
  },
});

const world = defineSim([stock, spender]);
const start: Record<Item, number> = { ...STARTING_STOCK, canister: 0 };

describe('stock', () => {
  it('starts with the stock from content and every canister lying on the map', () => {
    const w = scenario(
      world,
      `
      #c..#
      #.c.#
    `,
    );
    expect(w.query(stock).items()).toEqual({ ...start, canister: 2 });
    expect(w.query(stock).creative()).toBe(false);
  });

  it('spends what a command pays', () => {
    const w = scenario(world)
      .do(spender, 'buy', { cost: { scrap: 10, steel: 5 } })
      .run();
    expect(w.refusals).toEqual([]);
    expect(w.query(stock).items()).toEqual({
      ...start,
      scrap: start.scrap - 10,
      steel: start.steel - 5,
    });
  });

  it('spends down to nothing, and refuses one unit more without touching the stock', () => {
    const w = scenario(world)
      .do(spender, 'buy', { cost: { steel: start.steel } })
      .do(spender, 'buy', { cost: { scrap: 1, steel: 1 } })
      .run();
    expect(w.refusals).toEqual(['stock.notEnough']);
    expect(w.query(stock).items()).toEqual({ ...start, steel: 0 });
  });

  it('refuses a cost it can pay only in part', () => {
    const w = scenario(world)
      .do(spender, 'buy', { cost: { scrap: 1, canister: 1 } })
      .run();
    expect(w.refusals).toEqual(['stock.notEnough']);
    expect(w.query(stock).items()).toEqual(start);
  });

  it('takes refunds back in', () => {
    const w = scenario(world)
      .do(spender, 'takeApart', { cost: { scrap: 2, canister: 1 } })
      .run();
    expect(w.query(stock).items()).toEqual({ ...start, scrap: start.scrap + 2, canister: 1 });
  });

  it('pays for nothing in creative mode, and still takes refunds', () => {
    const w = scenario(world)
      .do(stock, 'setCreative', { on: true })
      .do(spender, 'buy', { cost: { steel: start.steel + 50, canister: 3 } })
      .do(spender, 'takeApart', { cost: { scrap: 2 } })
      .run();
    expect(w.refusals).toEqual([]);
    expect(w.query(stock).items()).toEqual({ ...start, scrap: start.scrap + 2 });
    expect(w.query(stock).shortOf({ steel: 9999 })).toBeUndefined();
    w.do(stock, 'setCreative', { on: false }).run();
    expect(w.query(stock).shortOf({ steel: 9999 })).toBe('stock.notEnough');
  });

  it('treats a broken amount as a bug, not a refusal, in creative mode too', () => {
    const w = scenario(world);
    expect(() => w.query(stock).shortOf({ scrap: -1 })).toThrow(/not a whole amount/);
    expect(() => w.query(stock).shortOf({ scrap: 1.5 })).toThrow(/not a whole amount/);
    w.do(stock, 'setCreative', { on: true }).run();
    expect(() => w.query(stock).shortOf({ steel: -2 })).toThrow(/not a whole amount/);
    expect(() => w.do(spender, 'takeApart', { cost: { scrap: 0.5 } }).run()).toThrow(
      /not a whole amount/,
    );
  });

  it('never holds less than nothing', () => {
    const item = fc.constantFrom<Item>('scrap', 'steel', 'canister');
    const cost = fc.dictionary(item, fc.integer({ min: 0, max: 200 }), { maxKeys: 3 });
    const step = fc.oneof(
      fc.record({ type: fc.constant('buy' as const), cost }),
      fc.record({ type: fc.constant('takeApart' as const), cost }),
      fc.record({ type: fc.constant('creative' as const), on: fc.boolean() }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 60, size: 'max' }), (steps) => {
        let w = scenario(world);
        for (const s of steps) {
          if (s.type === 'creative') w = w.do(stock, 'setCreative', { on: s.on });
          else w = w.do(spender, s.type, { cost: s.cost });
          w = w.run();
          for (const amount of Object.values(w.query(stock).items())) {
            expect(amount).toBeGreaterThanOrEqual(0);
          }
        }
      }),
    );
  });
});
