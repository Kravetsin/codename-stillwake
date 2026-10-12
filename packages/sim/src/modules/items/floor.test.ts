import { FLOOR, ITEMS } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseLayout } from '../../core/layout';
import { defineSim } from '../../core/sim';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import { grid, rooms } from '../index';
import { items, type Item, type Place } from './index';

const world = defineSim([grid, rooms, items]);

/** A room with a floor across it, three rows of air above it, and space to its right. */
const MAP = ['#######   ', '#.....#   ', '#.....#   ', '#.....#   ', '#=====#   ', '#######   '];
const WIDTH = 10;
const at = (x: number, y: number) => y * WIDTH + x;
const room = () => scenario(world, parseLayout(MAP));

const floor = (w: Scenario) => w.query(items).floor();
const drop = (w: Scenario, src: Place, count: number, cell: number, from = 0) =>
  w.do(items, 'drop', { src, count, cell }, from).run();

describe('the floor', () => {
  it('takes a stack dropped onto a cell, which falls until something holds it', () => {
    const w = giveItems(room(), 0, { scrap: 10 });
    drop(w, { slot: 0 }, 4, at(2, 1));
    expect(w.query(items).inventory(0)[0]).toEqual({ item: 'scrap', count: 6 });
    w.run(5);
    // On the floor row's top: the cell above it.
    expect(floor(w)).toEqual([
      expect.objectContaining({ item: 'scrap', count: 4, cell: at(2, 3) }),
    ]);
  });

  it('holds nothing up in space, where a stack floats where it was dropped', () => {
    const w = giveItems(room(), 0, { scrap: 1 });
    drop(w, { slot: 0 }, 1, at(8, 1));
    w.run(5);
    expect(floor(w)[0]?.cell).toBe(at(8, 1));
  });

  it('lifts a stack out of something built where it lies, onto the top of it', () => {
    const w = giveItems(room(), 0, { scrap: 1 });
    // Into the hull's bottom row: up through the floor row onto the floor.
    drop(w, { slot: 0 }, 1, at(3, 5));
    w.run(5);
    expect(floor(w)[0]?.cell).toBe(at(3, 3));
  });

  it('gathers stacks of one item in a cell into one, up to the stack limit', () => {
    const w = giveItems(room(), 0, { scrap: 10, canister: 5 });
    drop(w, { slot: 0 }, 3, at(2, 1));
    w.run(5);
    // Falling onto the first, already lying on the floor.
    drop(w, { slot: 0 }, 4, at(2, 1));
    drop(w, { slot: 1 }, 5, at(2, 1));
    w.run(5);
    expect(floor(w).map((s) => [s.item, s.count, s.cell])).toEqual([
      ['scrap', 7, at(2, 3)],
      ['canister', 5, at(2, 3)],
    ]);
    const more = giveItems(w, 1, { canister: 5 });
    drop(more, { slot: 0 }, 2, at(2, 1), 1);
    more.run(5);
    // A full stack takes no more: the two lie side by side.
    expect(floor(more).map((s) => [s.item, s.count])).toEqual([
      ['scrap', 7],
      ['canister', 5],
      ['canister', 2],
    ]);
  });

  it('refuses a drop from nowhere, of nothing, or onto no cell', () => {
    const w = giveItems(room(), 0, { scrap: 1 });
    drop(w, { slot: 99 }, 1, at(2, 1));
    drop(w, { slot: 5 }, 1, at(2, 1));
    drop(w, { slot: 0 }, 0, at(2, 1));
    drop(w, { crate: 7, slot: 0 }, 1, at(2, 1));
    drop(w, { slot: 0 }, 1, -1);
    drop(w, { slot: 0 }, 1, WIDTH * MAP.length);
    expect(w.refusals).toEqual([
      'items.noSlot',
      'items.empty',
      'items.empty',
      'items.noCrate',
      'items.noCell',
      'items.noCell',
    ]);
    expect(floor(w)).toEqual([]);
  });

  it('gives a stack to whoever picks it up, as much as fits, the rest left lying', () => {
    const w = giveItems(room(), 0, { scrap: 20 });
    drop(w, { slot: 0 }, 20, at(2, 3));
    const [stack] = floor(w);
    if (!stack) throw new Error('nothing dropped');
    // Peer 1 has room for 15 more: its inventory is canisters but for one slot of scrap.
    giveItems(w, 1, { canister: 5 * (36 - 1), scrap: ITEMS.scrap.stack - 15 });
    w.do(items, 'pickUp', { id: stack.id }, 1).run();
    expect(floor(w)).toEqual([expect.objectContaining({ id: stack.id, count: 5 })]);
    w.do(items, 'pickUp', { id: stack.id }, 1).run();
    expect(w.refusals).toEqual(['items.full']);
  });

  it('keeps its own drop from the dropper for a moment, not from anyone else', () => {
    const w = giveItems(room(), 0, { scrap: 2 });
    drop(w, { slot: 0 }, 1, at(2, 3));
    drop(w, { slot: 0 }, 1, at(4, 3));
    const [mine, theirs] = floor(w);
    if (!mine || !theirs) throw new Error('nothing dropped');
    w.do(items, 'pickUp', { id: mine.id }, 0).run();
    w.do(items, 'pickUp', { id: theirs.id }, 1).run();
    expect(w.refusals).toEqual(['items.tooSoon']);
    w.run(FLOOR.ownPickupDelay);
    w.do(items, 'pickUp', { id: mine.id }, 0).run();
    w.do(items, 'pickUp', { id: mine.id }, 1).run();
    expect(w.refusals).toEqual(['items.tooSoon', 'items.gone']);
    expect(floor(w)).toEqual([]);
  });

  it('never makes or loses an item, whatever is moved, dropped or picked up', () => {
    const ALL: readonly Item[] = ['scrap', 'steel', 'canister'];
    const place: fc.Arbitrary<Place> = fc.record({ slot: fc.integer({ min: -1, max: 37 }) });
    const step = fc.oneof(
      fc.record({
        type: fc.constant('drop' as const),
        src: place,
        count: fc.integer({ min: 0, max: 600 }),
        cell: fc.integer({ min: -1, max: WIDTH * MAP.length }),
        from: fc.nat(1),
      }),
      fc.record({
        type: fc.constant('pickUp' as const),
        id: fc.integer({ min: 0, max: 12 }),
        from: fc.nat(1),
        wait: fc.integer({ min: 0, max: FLOOR.ownPickupDelay }),
      }),
    );
    const everything = (w: Scenario) => {
      const held = [0, 1].flatMap((p) => w.query(items).inventory(p));
      return ALL.map(
        (item) =>
          held.reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0) +
          floor(w).reduce((sum, s) => sum + (s.item === item ? s.count : 0), 0),
      );
    };
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40, size: 'max' }), (steps) => {
        const w = giveItems(giveItems(room(), 0, { scrap: 900, canister: 7 }), 1, { steel: 40 });
        const start = everything(w);
        for (const s of steps) {
          if (s.type === 'drop') drop(w, s.src, s.count, s.cell, s.from);
          else w.do(items, 'pickUp', { id: s.id }, s.from).run(1 + s.wait);
          expect(everything(w)).toEqual(start);
          for (const stack of floor(w)) {
            expect(stack.count >= 1 && stack.count <= ITEMS[stack.item].stack).toBe(true);
          }
        }
      }),
      { numRuns: 150 },
    );
  });
});
