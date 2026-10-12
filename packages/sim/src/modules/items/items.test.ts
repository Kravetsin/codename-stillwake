import { CRATE, INVENTORY, ITEMS, STARTING_CRATE } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseLayout } from '../../core/layout';
import { defineModule, refuse } from '../../core/module';
import { defineSim } from '../../core/sim';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import { grid, rooms } from '../index';
import { placed, setCrate } from './stacks';
import type { ItemsState } from './state';
import {
  items,
  type Cost,
  type Item,
  type ItemsModule,
  type Place,
  type Slot,
  type Target,
} from './index';

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

const world = defineSim([grid, rooms, items, trader]);
const ALL: readonly Item[] = ['scrap', 'steel', 'canister'];
const [SCRAP, STEEL, CANISTERS] = [360, 60, 3];

const count = (w: Scenario, item: Item, peer = 0) =>
  w
    .query(items)
    .inventory(peer)
    .reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
const totals = (w: Scenario, peer = 0) => ALL.map((item) => count(w, item, peer));
const stored = (w: Scenario) => {
  const slice = w.sim.world.slices.items as {
    inventories: { peer: number }[];
    crates: { crate: number }[];
  };
  return {
    inventories: slice.inventories.map((i) => i.peer),
    crates: slice.crates.map((c) => c.crate),
  };
};
const empty = (n: number): Slot[] => Array.from({ length: n }, () => null);
/** A world with no map, peer 0 carrying scrap and steel. */
const stocked = () => giveItems(scenario(world), 0, { scrap: SCRAP, steel: STEEL });

/** Two crates, machines 1 and 2: the first holds scrap, steel and canisters, the second nothing. */
const crates = () => {
  const w = scenario(world, parseLayout(['#KK.KK#']));
  const slots = placed(empty(CRATE.slots), { scrap: SCRAP, steel: STEEL, canister: CANISTERS });
  if (!slots) throw new Error('no room');
  setCrate(w.sim.world.slices.items as ItemsState, 1, slots);
  return w;
};
const move = (w: Scenario, src: Place, dst: Target, n: number, from = 0) =>
  w.do(items, 'move', { src, dst, count: n }, from).run();
const crate = (w: Scenario, id: number) => w.query(items).crate(id);

describe('items', () => {
  describe('inventories', () => {
    it('start empty, and none is kept until it changes', () => {
      const w = scenario(world);
      expect(w.query(items).inventory(3)).toEqual(empty(INVENTORY.slots));
      expect(w.query(items).creative()).toBe(false);
      expect(stored(w)).toEqual({ inventories: [], crates: [] });
    });

    it("pay from the sender's inventory alone, kept from then on in peer order", () => {
      const w = giveItems(stocked(), 4, { scrap: SCRAP, steel: STEEL });
      giveItems(w, 2, { steel: STEEL });
      w.do(trader, 'buy', { cost: { scrap: 10, steel: 5 } }, 4)
        .do(trader, 'buy', { cost: { steel: 1 } }, 2)
        .run();
      expect(w.refusals).toEqual([]);
      expect(totals(w, 4)).toEqual([SCRAP - 10, STEEL - 5, 0]);
      expect(totals(w, 2)).toEqual([0, STEEL - 1, 0]);
      expect(totals(w, 0)).toEqual([SCRAP, STEEL, 0]);
      expect(stored(w).inventories).toEqual([0, 2, 4]);
      expect(w.sim.world.slices.trader).toEqual({ paid: [{ scrap: 10, steel: 5 }, { steel: 1 }] });
    });

    it('pay from the last stacks first, so the first slots are the last to empty', () => {
      const w = stocked()
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

    it('spend down to nothing, and refuse one unit more without a change', () => {
      const w = stocked()
        .do(trader, 'buy', { cost: { steel: STEEL } })
        .run()
        .do(trader, 'buy', { cost: { scrap: 1, steel: 1 } })
        .run();
      expect(w.refusals).toEqual(['items.notEnough']);
      expect(totals(w)).toEqual([SCRAP, 0, 0]);
      expect(w.query(items).inventory(0)[1]).toBeNull();
    });

    it('refuse a cost they can pay only in part', () => {
      const w = stocked()
        .do(trader, 'buy', { cost: { scrap: 1, canister: 1 } })
        .run();
      expect(w.refusals).toEqual(['items.notEnough']);
      expect(totals(w)).toEqual([SCRAP, STEEL, 0]);
    });

    it('take refunds onto stacks of the item first, then into the first empty slots', () => {
      const w = stocked()
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

    it('refuse a refund that does not fit, counting room on the stacks there are', () => {
      const scrapRoom = ITEMS.scrap.stack - SCRAP;
      const steelRoom = ITEMS.steel.stack - STEEL;
      const slotsLeft = INVENTORY.slots - 2;
      const w = stocked()
        .do(trader, 'refund', { cost: { canister: slotsLeft * ITEMS.canister.stack } })
        .run();
      expect(w.query(items).fullFor(0, { canister: 1 })).toBe('items.full');
      expect(w.query(items).fullFor(0, { scrap: scrapRoom, steel: steelRoom })).toBeUndefined();
      w.do(trader, 'refund', { cost: { scrap: scrapRoom, steel: steelRoom + 1 } }).run();
      expect(w.refusals).toEqual(['items.full']);
      expect(totals(w)).toEqual([SCRAP, STEEL, slotsLeft * ITEMS.canister.stack]);
    });

    it('take nothing in creative mode, and still give', () => {
      const w = stocked()
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

    it('keep no inventory for a change of nothing', () => {
      const w = scenario(world)
        .do(trader, 'buy', { cost: { scrap: 0 } })
        .do(trader, 'refund', { cost: {} })
        .run();
      expect(w.refusals).toEqual([]);
      expect(stored(w).inventories).toEqual([]);
    });

    it('treat a broken amount as a bug, not a refusal, in creative mode too', () => {
      const w = scenario(world);
      expect(() => w.query(items).shortOf(0, { scrap: -1 })).toThrow(/not a whole amount/);
      expect(() => w.query(items).fullFor(0, { scrap: 1.5 })).toThrow(/not a whole amount/);
      w.do(items, 'setCreative', { on: true }).run();
      expect(() => w.query(items).shortOf(0, { steel: -2 })).toThrow(/not a whole amount/);
      expect(() => w.do(trader, 'buy', { cost: { scrap: 0.5 } }).run()).toThrow(
        /not a whole amount/,
      );
    });

    it('keep every stack within its limit, and every change exactly what was paid or given', () => {
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
          const w = stocked();
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
                if (slot)
                  expect(slot.count >= 1 && slot.count <= ITEMS[slot.item].stack).toBe(true);
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

  describe('crates', () => {
    it('start with the store in a crate drawn over an s, and nothing in the rest', () => {
      const w = scenario(world, parseLayout(['#KK.KK#'], [' s']));
      expect(
        w
          .query(grid)
          .machines()
          .map((m) => [m.id, m.kind]),
      ).toEqual([
        [1, 'crate'],
        [2, 'crate'],
      ]);
      const store = Object.entries(STARTING_CRATE).map(([item, count]) => ({ item, count }));
      expect(crate(w, 1)).toEqual([...store, ...empty(CRATE.slots - store.length)]);
      expect(crate(w, 2)).toEqual(empty(CRATE.slots));
      expect(stored(w).crates).toEqual([1]);
      expect(() => world.create(1, parseLayout(['#KK.'], ['   s']))).toThrow(
        "'s' is under no crate",
      );
    });

    it('give a whole stack or part of one to a slot of an inventory, and take some back', () => {
      const w = crates();
      move(w, { crate: 1, slot: 0 }, { slot: 4 }, 999);
      move(w, { crate: 1, slot: 1 }, { slot: 0 }, 25, 3);
      expect(w.refusals).toEqual([]);
      expect(w.query(items).inventory(0)[4]).toEqual({ item: 'scrap', count: SCRAP });
      expect(w.query(items).inventory(3)[0]).toEqual({ item: 'steel', count: 25 });
      expect(crate(w, 1).slice(0, 2)).toEqual([null, { item: 'steel', count: STEEL - 25 }]);
      move(w, { slot: 4 }, { crate: 1, slot: 5 }, 10);
      expect(crate(w, 1)[5]).toEqual({ item: 'scrap', count: 10 });
      expect(w.query(items).inventory(0)[4]).toEqual({ item: 'scrap', count: SCRAP - 10 });
    });

    it('stack onto the same item up to its limit, leaving the rest where it was', () => {
      const w = giveItems(crates(), 0, { scrap: 400 });
      move(w, { crate: 1, slot: 0 }, { slot: 0 }, 999);
      expect(w.query(items).inventory(0)[0]).toEqual({ item: 'scrap', count: ITEMS.scrap.stack });
      expect(crate(w, 1)[0]).toEqual({ item: 'scrap', count: 400 + SCRAP - ITEMS.scrap.stack });
      move(w, { crate: 1, slot: 0 }, { slot: 0 }, 1);
      expect(w.refusals).toEqual(['items.full']);
    });

    it('swap a whole stack with another item, and refuse a part of one onto it', () => {
      const w = giveItems(crates(), 0, { canister: 2 });
      move(w, { crate: 1, slot: 0 }, { slot: 0 }, 100);
      expect(w.refusals).toEqual(['items.full']);
      move(w, { crate: 1, slot: 0 }, { slot: 0 }, 999);
      expect(w.query(items).inventory(0)[0]).toEqual({ item: 'scrap', count: SCRAP });
      expect(crate(w, 1)[0]).toEqual({ item: 'canister', count: 2 });
    });

    it("with no slot, fill the other side's stacks of the item, then its empty slots", () => {
      const w = giveItems(crates(), 0, { scrap: 200 });
      move(w, { slot: 0 }, { crate: 1 }, 999);
      expect(w.refusals).toEqual([]);
      expect(crate(w, 1)[0]).toEqual({ item: 'scrap', count: ITEMS.scrap.stack });
      expect(crate(w, 1)[3]).toEqual({ item: 'scrap', count: 200 + SCRAP - ITEMS.scrap.stack });
      expect(w.query(items).inventory(0)[0]).toBeNull();
      move(w, { crate: 1, slot: 2 }, {}, 999, 1);
      expect(w.query(items).inventory(1)[0]).toEqual({
        item: 'canister',
        count: CANISTERS,
      });
    });

    it('move within an inventory, and between two crates', () => {
      const w = giveItems(crates(), 0, { steel: 7 });
      move(w, { slot: 0 }, { slot: 8 }, 999);
      move(w, { crate: 1, slot: 2 }, { crate: 2, slot: 0 }, 999);
      expect(w.refusals).toEqual([]);
      expect(w.query(items).inventory(0)[8]).toEqual({ item: 'steel', count: 7 });
      expect(w.query(items).inventory(0)[0]).toBeNull();
      expect(crate(w, 2)[0]).toEqual({ item: 'canister', count: CANISTERS });
      expect(stored(w).crates).toEqual([1, 2]);
    });

    it('keep no entry for a crate emptied', () => {
      const w = crates();
      for (const slot of [0, 1, 2]) move(w, { crate: 1, slot }, {}, 999);
      expect(w.refusals).toEqual([]);
      expect(stored(w).crates).toEqual([]);
      expect(totals(w)).toEqual([SCRAP, STEEL, CANISTERS]);
    });

    it('give the last stack to the first of two heroes taking it on one tick', () => {
      const w = crates()
        .do(items, 'move', { src: { crate: 1, slot: 2 }, dst: {}, count: 999 }, 2)
        .do(items, 'move', { src: { crate: 1, slot: 2 }, dst: {}, count: 999 }, 1)
        .run();
      expect(w.refusals).toEqual(['items.empty']);
      expect([count(w, 'canister', 2), count(w, 'canister', 1)]).toEqual([CANISTERS, 0]);
    });

    it('refuse a move from nothing, onto no room, of no crate or of no slot', () => {
      const w = giveItems(crates(), 0, { scrap: 1 });
      move(w, { crate: 1, slot: 7 }, {}, 1);
      move(w, { crate: 1, slot: 0 }, {}, 0);
      expect(w.refusals).toEqual(['items.empty', 'items.empty']);

      move(w, { crate: 99, slot: 0 }, {}, 1);
      move(w, { slot: 0 }, { crate: 99 }, 1);
      expect(w.refusals.slice(2)).toEqual(['items.noCrate', 'items.noCrate']);

      move(w, { slot: -1 }, { slot: 1 }, 1);
      move(w, { slot: INVENTORY.slots }, { crate: 1 }, 1);
      move(w, { slot: 0 }, { crate: 1, slot: CRATE.slots }, 1);
      move(w, { slot: 0 }, { slot: 0 }, 1);
      move(w, { slot: 0 }, {}, 1);
      expect(w.refusals.slice(4)).toEqual(Array(5).fill('items.noSlot'));
      expect(totals(w)).toEqual([1, 0, 0]);

      const full = giveItems(crates(), 0, { canister: INVENTORY.slots * ITEMS.canister.stack });
      move(full, { crate: 1, slot: 0 }, {}, 999);
      expect(full.refusals).toEqual(['items.full']);
      expect(crate(full, 1)[0]).toEqual({ item: 'scrap', count: SCRAP });
    });

    it('refuse a crate that is another machine', () => {
      const w = giveItems(scenario(world, 'TT.KK\nTT...'), 0, { scrap: 1 });
      move(w, { slot: 0 }, { crate: 1 }, 1);
      move(w, { slot: 0 }, { crate: 2 }, 1);
      expect(w.refusals).toEqual(['items.noCrate']);
      expect(crate(w, 2)[0]).toEqual({ item: 'scrap', count: 1 });
    });

    it('never make or lose an item, nor keep an entry for an empty crate', () => {
      const place = fc.oneof(
        fc.record({ slot: fc.integer({ min: -1, max: 37 }) }),
        fc.record({
          crate: fc.integer({ min: 1, max: 3 }),
          slot: fc.integer({ min: -1, max: 28 }),
        }),
      );
      const target: fc.Arbitrary<Target> = fc.oneof(
        place,
        fc.constant({}),
        fc.record({ crate: fc.integer({ min: 1, max: 3 }) }),
      );
      const step = fc.record({
        src: place,
        dst: target,
        count: fc.oneof(fc.constant(999), fc.integer({ min: 0, max: 400 })),
        from: fc.nat(2),
      });
      const everything = (w: Scenario) => {
        const all = [0, 1, 2].flatMap((p) => w.query(items).inventory(p));
        for (const id of [1, 2]) all.push(...crate(w, id));
        return ALL.map((item) => all.reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0));
      };
      fc.assert(
        fc.property(fc.array(step, { maxLength: 80, size: 'max' }), (steps) => {
          const w = giveItems(crates(), 1, { canister: 9, steel: 600 });
          const start = everything(w);
          for (const s of steps) {
            w.do(items, 'move', { src: s.src, dst: s.dst, count: s.count }, s.from).run();
            expect(everything(w)).toEqual(start);
            for (const id of [1, 2]) {
              for (const slot of crate(w, id)) {
                if (slot)
                  expect(slot.count >= 1 && slot.count <= ITEMS[slot.item].stack).toBe(true);
              }
            }
            const kept = stored(w).crates;
            expect(kept.every((id) => crate(w, id).some((x) => x !== null))).toBe(true);
          }
        }),
        { numRuns: 200 },
      );
    });
  });
});

describe('moves a client has in flight', () => {
  it('show the slots as the moves would leave them, and leave the world be', () => {
    const place: fc.Arbitrary<Place> = fc.oneof(
      fc.record({ slot: fc.integer({ min: -1, max: 37 }) }),
      fc.record({ crate: fc.integer({ min: 1, max: 3 }), slot: fc.integer({ min: -1, max: 28 }) }),
    );
    const target: fc.Arbitrary<Target> = fc.oneof(
      place,
      fc.constant({}),
      fc.record({ crate: fc.integer({ min: 1, max: 3 }) }),
    );
    const step = fc.record({
      src: place,
      dst: target,
      count: fc.oneof(fc.constant(999), fc.integer({ min: 0, max: 400 })),
    });
    fc.assert(
      fc.property(fc.array(step, { maxLength: 30, size: 'max' }), (moves) => {
        const w = giveItems(crates(), 1, { canister: 9, steel: 600 });
        const hash = w.sim.hash();
        const shown = w.query(items).afterMoves(1, moves);
        expect(w.sim.hash()).toBe(hash);
        const before = [1, 2, 3].map((id) => crate(w, id));
        for (const m of moves) w.do(items, 'move', m, 1);
        w.run();
        expect(shown.inventory).toEqual(w.query(items).inventory(1));
        [1, 2, 3].forEach((id, i) =>
          expect(shown.crates.get(id) ?? before[i]).toEqual(crate(w, id)),
        );
      }),
      { numRuns: 200 },
    );
  });
});
