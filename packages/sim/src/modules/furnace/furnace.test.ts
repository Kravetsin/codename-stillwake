import { AIR, ITEMS } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { parseLayout } from '../../core/layout';
import { defineSim } from '../../core/sim';
import { builder } from '../../testing/builder';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import { atmosphere, grid, items, MODULES, power } from '../index';
import { furnace } from './index';

const world = defineSim([...MODULES, builder]);

/**
 * Ten wide: a solar panel out in space cabled to a furnace in a sealed room, the furnace piped to a
 * tank holding a canister's worth of oxygen.
 */
const ROWS = ['PPP       ', '          ', '##########', '#FF.TT...#', '#FF.TT...#', '##########'];
const at = (x: number, y: number) => y * 10 + x;
const PANEL = at(0, 0);
const FURNACE = at(1, 3);
const CABLED = [
  [
    { x: 0, y: 0 },
    { x: 1, y: 3 },
  ],
] as const;
const FILLED = ['', '', '', '', ' ----o'];

/** The world, a peer 0 with `chunks` scrap chunks, and the furnace's machine id. */
function setUp(chunks = 2, under = FILLED) {
  const w = giveItems(scenario(world, parseLayout(ROWS, under, CABLED)), 0, {
    scrapChunk: chunks,
  });
  return { w, id: w.query(grid).machineAt(FURNACE)?.id ?? 0 };
}
const tankOxygen = (w: Scenario) =>
  w.query(atmosphere).oxygenIn(w.query(grid).machineAt(at(4, 3))?.id ?? 0);
const putIn = (w: Scenario, id: number, count = 1) =>
  w.do(items, 'move', { src: { slot: 0 }, dst: { crate: id }, count }).run();
const CHUNK = ITEMS.scrapChunk;

describe('furnace', () => {
  it('smelts an item into its yields in its ticks at full power, its oxygen paid as it begins', () => {
    const { w, id } = setUp();
    expect(w.query(power).networks()[0]?.demand).toBe(0);
    putIn(w, id, 2);
    // A move naming no slot of a furnace goes into its input.
    expect(w.query(items).crate(id)[0]).toEqual({ item: 'scrapChunk', count: 2 });
    expect(w.query(power).networks()[0]).toMatchObject({ demand: 4, satisfaction: 1000 });
    expect(tankOxygen(w)).toBe(AIR.canister - CHUNK.oxygen);
    w.run(CHUNK.smeltTicks - 2);
    expect(w.query(items).crate(id)[1]).toBeNull();
    expect(w.query(furnace).at(id)).toMatchObject({
      item: 'scrapChunk',
      progress: (CHUNK.smeltTicks - 1) * 1000,
      work: CHUNK.smeltTicks * 1000,
      problem: undefined,
    });
    w.run();
    expect(w.query(items).crate(id).slice(0, 2)).toEqual([
      { item: 'scrapChunk', count: 1 },
      { item: 'scrap', count: CHUNK.yields.scrap },
    ]);
    // The next one begins on the next tick, paying again.
    w.run();
    expect(tankOxygen(w)).toBe(AIR.canister - 2 * CHUNK.oxygen);
  });

  it('stands still without power, saying so, and draws no oxygen until it has some', () => {
    const { w, id } = setUp();
    w.do(power, 'cut', { a: PANEL, b: FURNACE }).run();
    putIn(w, id);
    w.run(20);
    expect(w.query(furnace).at(id)).toMatchObject({ progress: 0, problem: 'furnace.unpowered' });
    expect(tankOxygen(w)).toBe(AIR.canister);
  });

  it('waits for its oxygen with a dry pipe', () => {
    const { w, id } = setUp(1, ['', '', '', '', ' ----']);
    putIn(w, id);
    w.run(20);
    expect(w.query(furnace).at(id)).toMatchObject({ progress: 0, problem: 'furnace.noOxygen' });
    expect(w.query(items).crate(id)[0]).toEqual({ item: 'scrapChunk', count: 1 });
  });

  it('waits with no room for what it makes, drawing no power meanwhile', () => {
    const { w, id } = setUp(1);
    putIn(w, id);
    const full = { item: 'steel' as const, count: ITEMS.steel.stack };
    const slots = [...w.query(items).crate(id)];
    // Nothing puts items into a furnace's outputs but smelting: straight into the world instead.
    (w.sim.world.slices.items as { crates: unknown[] }).crates = [
      { crate: id, slots: [slots[0] ?? null, full, full, full] },
    ];
    w.run(CHUNK.smeltTicks + 10);
    expect(w.query(furnace).at(id)).toMatchObject({
      progress: CHUNK.smeltTicks * 1000,
      problem: 'furnace.full',
    });
    expect(w.query(power).networks()[0]?.demand).toBe(0);
    expect(w.query(items).crate(id)[0]).toEqual({ item: 'scrapChunk', count: 1 });
  });

  it('starts over on an item taken out and put back, the oxygen paid for it gone', () => {
    const { w, id } = setUp(1);
    putIn(w, id);
    w.run(30);
    w.do(items, 'move', { src: { crate: id, slot: 0 }, dst: {}, count: 1 }).run();
    expect(w.query(furnace).at(id)).toBeUndefined();
    putIn(w, id);
    expect(w.query(furnace).at(id)?.progress).toBe(1000);
    expect(tankOxygen(w)).toBe(AIR.canister - 2 * CHUNK.oxygen);
  });

  it('takes nothing put into its outputs, and gives what they hold', () => {
    const { w, id } = setUp(1);
    w.do(items, 'move', { src: { slot: 0 }, dst: { crate: id, slot: 2 }, count: 1 }).run();
    expect(w.refusals).toEqual(['items.takeOnly']);
    putIn(w, id);
    w.run(CHUNK.smeltTicks);
    w.do(items, 'move', { src: { crate: id, slot: 1 }, dst: {}, count: 999 }).run();
    expect(w.refusals).toEqual(['items.takeOnly']);
    expect(w.query(items).inventory(0)[0]).toEqual({ item: 'scrap', count: CHUNK.yields.scrap });
  });
});
