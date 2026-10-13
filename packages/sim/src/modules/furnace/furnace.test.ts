import { FURNACE, ITEMS } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { parseLayout } from '../../core/layout';
import { defineSim } from '../../core/sim';
import { builder } from '../../testing/builder';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import { atmosphere, grid, items, MODULES } from '../index';
import { furnace } from './index';

const world = defineSim([...MODULES, builder]);

/**
 * Ten wide: a sealed room holding a furnace, and a tank of oxygen piped to a vent that airs the room.
 * The furnace has no pipe and no cable: it burns planks and breathes the room's air.
 */
const ROWS = ['##########', '#FF.TT...#', '#FF.TTV..#', '##########'];
const UNDER = ['', '    o', '    ---'];
const at = (x: number, y: number) => y * 10 + x;
const FURNACE_AT = at(1, 1);
const TANK = at(4, 1);
const CHUNK = ITEMS.scrapChunk;
const PLANK = ITEMS.planks;

/** The world, its room aired, a peer 0 carrying `carry`, and the furnace's machine id. */
function setUp(carry = { scrapChunk: 2, planks: 2 }) {
  const w = giveItems(scenario(world, parseLayout(ROWS, UNDER)), 0, carry);
  for (let i = 0; i < 2000 && !w.query(atmosphere).airedAt(FURNACE_AT); i++) w.run();
  expect(w.query(atmosphere).airedAt(FURNACE_AT)).toBe(true);
  return { w, id: w.query(grid).machineAt(FURNACE_AT)?.id ?? 0 };
}
const tankOxygen = (w: Scenario) =>
  w.query(atmosphere).oxygenIn(w.query(grid).machineAt(TANK)?.id ?? 0);
/** Moves `count` of the first stack peer 0 holds of `item` into slot `slot` of furnace `id`. */
function put(w: Scenario, id: number, item: string, slot: number, count = 1) {
  const from = w
    .query(items)
    .inventory(0)
    .findIndex((s) => s?.item === item);
  w.do(items, 'move', { src: { slot: from }, dst: { crate: id, slot }, count }).run();
  return w;
}
const fuelOf = (w: Scenario, id: number) => w.query(items).crate(id)[FURNACE.fuelSlot]?.count ?? 0;

describe('furnace', () => {
  it('lights only with salvage to smelt, fuel and air, using one fuel up', () => {
    const { w, id } = setUp();
    put(w, id, 'planks', FURNACE.fuelSlot, 2);
    w.run(5);
    // Fuel alone: nothing to smelt, no fire.
    expect(w.query(furnace).at(id)).toEqual({ burning: false });
    expect(fuelOf(w, id)).toBe(2);
    put(w, id, 'scrapChunk', 0);
    expect(w.query(furnace).at(id)).toMatchObject({ burning: true, problem: undefined });
    expect(fuelOf(w, id)).toBe(1);
  });

  it('says it has no fuel, and stands', () => {
    const { w, id } = setUp();
    put(w, id, 'scrapChunk', 0);
    w.run(20);
    expect(w.query(furnace).at(id)).toMatchObject({
      burning: false,
      progress: 0,
      problem: 'furnace.noFuel',
    });
  });

  it('smelts an item in its smelting ticks of fire, and the next on the same fire', () => {
    const { w, id } = setUp();
    put(w, id, 'planks', FURNACE.fuelSlot);
    put(w, id, 'scrapChunk', 0, 2);
    // The tick of the move lit it and did its first tick of work.
    w.run(CHUNK.smeltTicks - 2);
    expect(w.query(items).crate(id)[2]).toBeNull();
    expect(w.query(furnace).at(id)).toMatchObject({
      progress: CHUNK.smeltTicks - 1,
      work: CHUNK.smeltTicks,
    });
    w.run();
    expect(w.query(items).crate(id)[0]).toEqual({ item: 'scrapChunk', count: 1 });
    expect(w.query(items).crate(id)[2]).toEqual({ item: 'scrap', count: CHUNK.yields.scrap });
    w.run(CHUNK.smeltTicks);
    expect(w.query(items).crate(id)[0]).toBeNull();
    expect(w.query(items).crate(id)[2]).toEqual({ item: 'scrap', count: 2 * CHUNK.yields.scrap });
    // One plank smelted both and burns on.
    expect(fuelOf(w, id)).toBe(0);
    expect(w.query(furnace).at(id)).toEqual({ burning: true });
  });

  it('burns its fuel down with nothing left to smelt, and lights no more', () => {
    const { w, id } = setUp();
    put(w, id, 'planks', FURNACE.fuelSlot, 2);
    put(w, id, 'scrapChunk', 0);
    w.run(PLANK.burnTicks - 1);
    expect(w.query(furnace).at(id)).toEqual({ burning: false });
    w.run(100);
    expect(fuelOf(w, id)).toBe(1);
  });

  it("breathes its room's air while it burns, a breath every beat", () => {
    // Beside a twin with no fire: the room leaks alike in both, and the tank pays for it alike.
    const fired = setUp();
    const cold = setUp();
    for (const { w, id } of [fired, cold]) put(w, id, 'planks', FURNACE.fuelSlot).run(200);
    expect(tankOxygen(fired.w)).toBe(tankOxygen(cold.w));
    put(fired.w, fired.id, 'scrapChunk', 0);
    cold.w.run();
    // Lit on the tick of the move, it breathed then and on every beat after.
    fired.w.run(4 * FURNACE.breathEvery - 1);
    cold.w.run(4 * FURNACE.breathEvery - 1);
    expect(tankOxygen(cold.w) - tankOxygen(fired.w)).toBe(4 * FURNACE.breath);
  });

  it('does not light without air, and goes out when the air goes, its fuel lost', () => {
    const { w, id } = setUp();
    put(w, id, 'planks', FURNACE.fuelSlot, 2);
    put(w, id, 'scrapChunk', 0);
    expect(w.query(furnace).at(id)?.burning).toBe(true);
    // A hole in the hull: the room is space, and the fire's next breath finds none.
    w.do(builder, 'clear', { cell: at(9, 1), layer: 'structure' }).run();
    w.run(FURNACE.breathEvery);
    expect(w.query(furnace).at(id)).toMatchObject({ burning: false, problem: 'furnace.noAir' });
    w.run(100);
    expect(fuelOf(w, id)).toBe(1);
    expect(w.query(items).crate(id)[2]).toBeNull();
  });

  it('waits, unlit, with no room for what it makes', () => {
    const { w, id } = setUp();
    const full = { item: 'iron' as const, count: ITEMS.iron.stack };
    // Nothing puts items into a furnace's outputs but smelting: straight into the world instead.
    (w.sim.world.slices.items as { crates: unknown[] }).crates = [
      { crate: id, slots: [{ item: 'scrapChunk', count: 1 }, null, full, full, full] },
    ];
    put(w, id, 'planks', FURNACE.fuelSlot);
    w.run(20);
    expect(w.query(furnace).at(id)).toMatchObject({ burning: false, problem: 'furnace.full' });
    expect(fuelOf(w, id)).toBe(1);
  });

  it('starts over on an item taken out and put back', () => {
    const { w, id } = setUp();
    put(w, id, 'planks', FURNACE.fuelSlot);
    put(w, id, 'scrapChunk', 0);
    w.run(30);
    w.do(items, 'move', { src: { crate: id, slot: 0 }, dst: {}, count: 1 }).run();
    expect(w.query(furnace).at(id)).toEqual({ burning: true });
    put(w, id, 'scrapChunk', 0);
    expect(w.query(furnace).at(id)?.progress).toBe(1);
  });

  it('takes nothing put into its outputs, and gives what they hold', () => {
    const { w, id } = setUp();
    put(w, id, 'scrapChunk', 2);
    expect(w.refusals).toEqual(['items.takeOnly']);
    put(w, id, 'planks', FURNACE.fuelSlot);
    put(w, id, 'scrapChunk', 0);
    w.run(CHUNK.smeltTicks);
    w.do(items, 'move', { src: { crate: id, slot: 2 }, dst: {}, count: 999 }).run();
    expect(w.refusals).toEqual(['items.takeOnly']);
    const got = w
      .query(items)
      .inventory(0)
      .find((s) => s?.item === 'scrap');
    expect(got).toEqual({ item: 'scrap', count: CHUNK.yields.scrap });
  });
});
