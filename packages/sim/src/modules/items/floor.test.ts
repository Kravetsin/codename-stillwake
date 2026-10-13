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

/** A room ten cells wide with a floor across it and three rows of air above, and space to its right. */
const ROOM = ['############', '#..........#', '#..........#', '#..........#', '#==========#'];
const MAP = [...ROOM, '############'].map((row) => row.padEnd(26));
const WIDTH = 26;
const at = (x: number, y: number) => y * WIDTH + x;
const room = () => scenario(world, parseLayout(MAP));

const floor = (w: Scenario) => w.query(items).floor();
const column = (w: Scenario, i = 0) => (floor(w)[i]?.cell ?? -1) % WIDTH;
const drop = (w: Scenario, src: Place, count: number, cell: number, from = 0, facing = 0) =>
  w.do(items, 'drop', { src, count, cell, facing }, from).run();

describe('the floor', () => {
  it('takes a stack let go, which falls until something holds it, and comes to rest', () => {
    const w = giveItems(room(), 0, { scrap: 10 });
    drop(w, { slot: 0 }, 4, at(2, 1));
    expect(w.query(items).inventory(0)[0]).toEqual({ item: 'scrap', count: 6 });
    w.run(40);
    // On the floor row's top: the cell above it.
    expect(floor(w)).toEqual([
      expect.objectContaining({ item: 'scrap', count: 4, cell: at(2, 3), vx: 0, vy: 0 }),
    ]);
  });

  it('throws a stack the way the hero faces, a few cells along before it comes to rest', () => {
    const right = giveItems(room(), 0, { scrap: 1 });
    drop(right, { slot: 0 }, 1, at(3, 3), 0, 1);
    right.run(60);
    expect(column(right)).toBeGreaterThanOrEqual(5);
    expect(column(right)).toBeLessThanOrEqual(7);
    expect(floor(right)[0]).toEqual(expect.objectContaining({ vx: 0, vy: 0 }));

    const left = giveItems(room(), 0, { scrap: 1 });
    drop(left, { slot: 0 }, 1, at(8, 3), 0, -1);
    left.run(60);
    expect(column(left)).toBeGreaterThanOrEqual(4);
    expect(column(left)).toBeLessThanOrEqual(6);
  });

  it('stops a stack thrown at a wall against it', () => {
    const w = giveItems(room(), 0, { scrap: 1 });
    drop(w, { slot: 0 }, 1, at(10, 3), 0, 1);
    w.run(60);
    expect(floor(w)[0]?.cell).toBe(at(10, 3));
  });

  it('lets a stack thrown into space fly on and drift away, and past the edge it is gone', () => {
    const w = giveItems(room(), 0, { scrap: 2 });
    drop(w, { slot: 0 }, 1, at(14, 1), 0, 1);
    w.run(10);
    // Flying on as thrown, less the drift back past the moving ship; nothing falls in space.
    expect(column(w)).toBeGreaterThan(14);
    expect(Math.floor((floor(w)[0]?.cell ?? 0) / WIDTH)).toBeLessThanOrEqual(1);
    w.run(200);
    expect(floor(w)).toEqual([]);
    // One let go out there, not thrown, drifts back the other way.
    drop(w, { slot: 0 }, 1, at(20, 2));
    w.run(30);
    expect(column(w)).toBeLessThan(20);
  });

  it('lifts a stack out of something built where it lies, onto the top of it', () => {
    const w = giveItems(room(), 0, { scrap: 1 });
    // Into the hull's bottom row: up through the floor row onto the floor.
    drop(w, { slot: 0 }, 1, at(3, 5));
    w.run(40);
    expect(floor(w)[0]?.cell).toBe(at(3, 3));
  });

  it('gathers stacks of one item at rest in a cell into one, up to the stack limit', () => {
    const w = giveItems(room(), 0, { scrap: 10, canister: 5 });
    drop(w, { slot: 0 }, 3, at(2, 1));
    w.run(40);
    // Falling onto the first, already at rest on the floor.
    drop(w, { slot: 0 }, 4, at(2, 1));
    drop(w, { slot: 1 }, 5, at(2, 1));
    w.run(40);
    expect(floor(w).map((s) => [s.item, s.count, s.cell])).toEqual([
      ['scrap', 7, at(2, 3)],
      ['canister', 5, at(2, 3)],
    ]);
    const more = giveItems(w, 1, { canister: 5 });
    drop(more, { slot: 0 }, 2, at(2, 1), 1);
    more.run(40);
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
    expect(w.query(items).pickUpAmount(1, stack.id)).toBe(15);
    w.do(items, 'pickUp', { id: stack.id }, 1).run();
    expect(floor(w)).toEqual([expect.objectContaining({ id: stack.id, count: 5 })]);
    expect(w.query(items).pickUpAmount(1, stack.id)).toBe(0);
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

  it('never makes or loses an item inside the ship, whatever is moved, dropped or picked up', () => {
    const ALL: readonly Item[] = ['scrap', 'iron', 'canister'];
    const place: fc.Arbitrary<Place> = fc.record({ slot: fc.integer({ min: -1, max: 37 }) });
    // Anywhere inside the room, or off the grid: only space throws things away.
    const cell = fc.oneof(
      fc
        .record({ x: fc.integer({ min: 1, max: 10 }), y: fc.integer({ min: 1, max: 3 }) })
        .map(({ x, y }) => at(x, y)),
      fc.constant(-1),
    );
    const step = fc.oneof(
      fc.record({
        type: fc.constant('drop' as const),
        src: place,
        count: fc.integer({ min: 0, max: 600 }),
        cell,
        from: fc.nat(1),
        facing: fc.integer({ min: -1, max: 1 }),
        wait: fc.integer({ min: 0, max: 20 }),
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
        const w = giveItems(giveItems(room(), 0, { scrap: 900, canister: 7 }), 1, { iron: 40 });
        const start = everything(w);
        for (const s of steps) {
          if (s.type === 'drop') {
            drop(w, s.src, s.count, s.cell, s.from, s.facing);
            w.run(s.wait);
          } else w.do(items, 'pickUp', { id: s.id }, s.from).run(1 + s.wait);
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
