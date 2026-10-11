import { INVENTORY, ITEMS, STARTING_INVENTORY } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineModule, refuse } from '../../core/module';
import { defineSim } from '../../core/sim';
import { scenario, type Scenario } from '../../testing/scenario';
import { items, type Cost, type Item, type ItemsModule, type Slot } from './index';

/** Pays and refunds through `items` as `building` does, refusing what it cannot; keeps receipts. */
const trader = defineModule<[ItemsModule]>()({
  id: 'trader',
  dependsOn: ['items'],
  init: () => ({ paid: [] as Cost[] }),
  commands: {
    buy: {
      validate(ctx, p: { cost: Cost }) {
        const why = ctx.deps.items.query.shortOf(ctx.from, p.cost);
        if (why) return refuse(why);
      },
      apply(ctx, p: { cost: Cost }) {
        ctx.state.paid.push(ctx.deps.items.op.take(ctx.from, p.cost));
      },
    },
    refund: {
      validate(ctx, p: { cost: Cost }) {
        const why = ctx.deps.items.query.fullFor(ctx.from, p.cost);
        if (why) return refuse(why);
      },
      apply(ctx, p: { cost: Cost }) {
        ctx.deps.items.op.give(ctx.from, p.cost);
      },
    },
  },
});

const world = defineSim([items, trader]);
const ALL: readonly Item[] = ['scrap', 'steel', 'canister'];

const count = (w: Scenario, item: Item, peer = 0) =>
  w
    .query(items)
    .inventory(peer)
    .reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
const totals = (w: Scenario, peer = 0) => ALL.map((item) => count(w, item, peer));
const [SCRAP, STEEL] = [STARTING_INVENTORY.scrap, STARTING_INVENTORY.steel];
const start = [SCRAP, STEEL, 0];
const stored = (w: Scenario) =>
  (w.sim.world.slices.items as { inventories: { peer: number }[] }).inventories.map((i) => i.peer);
const empty = (n: number): Slot[] => Array.from({ length: n }, () => null);

describe('items', () => {
  it('starts every inventory with the starting items and the canisters on the map, in stacks', () => {
    const w = scenario(world, '#ccccccc#');
    const canister = ITEMS.canister.stack;
    expect(w.query(items).inventory(3)).toEqual([
      { item: 'scrap', count: STARTING_INVENTORY.scrap },
      { item: 'steel', count: STARTING_INVENTORY.steel },
      { item: 'canister', count: canister },
      { item: 'canister', count: 7 - canister },
      ...empty(INVENTORY.slots - 4),
    ]);
    expect(w.query(items).creative()).toBe(false);
    expect(stored(w)).toEqual([]);
  });

  it("pays from the sender's inventory alone, keeping it from then on, in peer order", () => {
    const w = scenario(world)
      .do(trader, 'buy', { cost: { scrap: 10, steel: 5 } }, 4)
      .do(trader, 'buy', { cost: { steel: 1 } }, 2)
      .run();
    expect(w.refusals).toEqual([]);
    expect(totals(w, 4)).toEqual([SCRAP - 10, STEEL - 5, 0]);
    expect(totals(w, 2)).toEqual([SCRAP, STEEL - 1, 0]);
    expect(totals(w, 0)).toEqual(start);
    expect(stored(w)).toEqual([2, 4]);
    expect(w.sim.world.slices.trader).toEqual({ paid: [{ scrap: 10, steel: 5 }, { steel: 1 }] });
  });

  it('pays from the last stacks first, so the first slots are the last to empty', () => {
    const w = scenario(world)
      .do(trader, 'refund', { cost: { scrap: ITEMS.scrap.stack } })
      .run()
      .do(trader, 'buy', { cost: { scrap: ITEMS.scrap.stack - 1 } })
      .run();
    // The refund topped up the first stack and spilled into a slot after the steel.
    expect(w.query(items).inventory(0).slice(0, 3)).toEqual([
      { item: 'scrap', count: SCRAP + 1 },
      { item: 'steel', count: STEEL },
      null,
    ]);
  });

  it('spends down to nothing, and refuses one unit more without a change', () => {
    const w = scenario(world)
      .do(trader, 'buy', { cost: { steel: STEEL } })
      .run()
      .do(trader, 'buy', { cost: { scrap: 1, steel: 1 } })
      .run();
    expect(w.refusals).toEqual(['items.notEnough']);
    expect(totals(w)).toEqual([SCRAP, 0, 0]);
    expect(w.query(items).inventory(0)[1]).toBeNull();
  });

  it('refuses a cost it can pay only in part', () => {
    const w = scenario(world)
      .do(trader, 'buy', { cost: { scrap: 1, canister: 1 } })
      .run();
    expect(w.refusals).toEqual(['items.notEnough']);
    expect(stored(w)).toEqual([]);
  });

  it('gives onto stacks of the item first, then into the first empty slots', () => {
    const w = scenario(world)
      .do(trader, 'refund', { cost: { canister: ITEMS.canister.stack + 1, steel: 3 } })
      .run();
    expect(w.query(items).inventory(0).slice(0, 5)).toEqual([
      { item: 'scrap', count: SCRAP },
      { item: 'steel', count: STEEL + 3 },
      { item: 'canister', count: ITEMS.canister.stack },
      { item: 'canister', count: 1 },
      null,
    ]);
  });

  it('refuses a refund that does not fit, counting room on the stacks there are', () => {
    const scrapRoom = ITEMS.scrap.stack - SCRAP;
    const steelRoom = ITEMS.steel.stack - STEEL;
    const slotsLeft = INVENTORY.slots - 2;
    const w = scenario(world)
      .do(trader, 'refund', { cost: { canister: slotsLeft * ITEMS.canister.stack } })
      .run();
    expect(w.query(items).fullFor(0, { canister: 1 })).toBe('items.full');
    expect(w.query(items).fullFor(0, { scrap: scrapRoom, steel: steelRoom })).toBeUndefined();
    w.do(trader, 'refund', { cost: { scrap: scrapRoom, steel: steelRoom + 1 } }).run();
    expect(w.refusals).toEqual(['items.full']);
    expect(totals(w)).toEqual([SCRAP, STEEL, slotsLeft * ITEMS.canister.stack]);
  });

  it('takes nothing in creative mode, and still gives', () => {
    const w = scenario(world)
      .do(items, 'setCreative', { on: true })
      .do(trader, 'buy', { cost: { steel: STEEL + 50, canister: 3 } })
      .do(trader, 'refund', { cost: { scrap: 2 } })
      .run();
    expect(w.refusals).toEqual([]);
    expect(totals(w)).toEqual([SCRAP + 2, STEEL, 0]);
    // Nothing was paid, so a refund of what was paid gives nothing back.
    expect(w.sim.world.slices.trader).toEqual({ paid: [{}] });
    expect(w.query(items).shortOf(0, { steel: 9999 })).toBeUndefined();
    w.do(items, 'setCreative', { on: false }).run();
    expect(w.query(items).shortOf(0, { steel: 9999 })).toBe('items.notEnough');
  });

  it('keeps no inventory for a change of nothing', () => {
    const w = scenario(world)
      .do(trader, 'buy', { cost: { scrap: 0 } })
      .do(trader, 'refund', { cost: {} })
      .run();
    expect(w.refusals).toEqual([]);
    expect(stored(w)).toEqual([]);
  });

  it('treats a broken amount as a bug, not a refusal, in creative mode too', () => {
    const w = scenario(world);
    expect(() => w.query(items).shortOf(0, { scrap: -1 })).toThrow(/not a whole amount/);
    expect(() => w.query(items).fullFor(0, { scrap: 1.5 })).toThrow(/not a whole amount/);
    w.do(items, 'setCreative', { on: true }).run();
    expect(() => w.query(items).shortOf(0, { steel: -2 })).toThrow(/not a whole amount/);
    expect(() => w.do(trader, 'buy', { cost: { scrap: 0.5 } }).run()).toThrow(/not a whole amount/);
  });

  it('keeps every stack within its limit, and every change exactly what was paid or given', () => {
    const item = fc.constantFrom<Item>(...ALL);
    const cost = fc.dictionary(item, fc.integer({ min: 0, max: 1500 }), { maxKeys: 3 });
    const step = fc.oneof(
      fc.record({
        type: fc.constantFrom('buy' as const, 'refund' as const),
        cost,
        from: fc.nat(2),
      }),
      fc.record({ type: fc.constant('creative' as const), on: fc.boolean() }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 60, size: 'max' }), (steps) => {
        const w = scenario(world);
        for (const s of steps) {
          const before = [0, 1, 2].map((peer) => totals(w, peer));
          const refused = w.refusals.length;
          if (s.type === 'creative') w.do(items, 'setCreative', { on: s.on }).run();
          else w.do(trader, s.type, { cost: s.cost }, s.from).run();
          const accepted = w.refusals.length === refused;
          for (const peer of [0, 1, 2]) {
            const slots = w.query(items).inventory(peer);
            expect(slots).toHaveLength(INVENTORY.slots);
            for (const slot of slots) {
              if (slot) expect(slot.count >= 1 && slot.count <= ITEMS[slot.item].stack).toBe(true);
            }
            const sign =
              s.type === 'creative' || !accepted || peer !== s.from
                ? 0
                : s.type === 'refund'
                  ? 1
                  : w.query(items).creative()
                    ? 0
                    : -1;
            const change = ALL.map((i) => (s.type === 'creative' ? 0 : (s.cost[i] ?? 0)) * sign);
            expect(totals(w, peer)).toEqual(before[peer]?.map((n, i) => n + (change[i] ?? 0)));
          }
        }
      }),
    );
  });
});
