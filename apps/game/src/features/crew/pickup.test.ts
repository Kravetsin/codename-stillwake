import { FLOOR, HERO } from '@stillwake/content';
import { parseLayout, stillwake, type Sim } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { UNIT, type Hero } from './hero';
import { pickUpsOf } from './pickup';

const MAP = ['#########', '#.......#', '#.......#', '#=======#', '#########'];
const WIDTH = 9;
const at = (x: number, y: number) => y * WIDTH + x;

/** A hero standing on the floor in cell column `x`. */
const standing = (x: number): Hero => ({
  x: x * UNIT + UNIT / 2,
  y: 3 * UNIT,
  vx: 0,
  vy: 0,
  climbing: false,
  facing: 1,
});

/** A room with a floor; the tests lay stacks on it straight into the slice, as drops would. */
const room = (): Sim => stillwake.create(1, parseLayout(MAP));

describe('what the hero picks up as it goes', () => {
  it('is every stack in a cell its body overlaps that the sim would let it take', () => {
    const sim = room();
    // Stacks laid on the floor straight into the slice, as a drop long ago would leave them.
    const floor = (sim.world.slices.items as { floor: unknown[]; ticks: number }).floor;
    floor.push(
      { id: 1, item: 'scrap', count: 3, cell: at(2, 2), by: 1, at: 0 },
      { id: 2, item: 'scrap', count: 3, cell: at(6, 2), by: 1, at: 0 },
      { id: 3, item: 'steel', count: 1, cell: at(2, 1), by: 1, at: 0 },
    );
    expect(HERO.width).toBeLessThanOrEqual(UNIT);
    expect(pickUpsOf(sim, 0, standing(2), new Set())).toEqual([1, 3]);
    expect(pickUpsOf(sim, 0, standing(6), new Set())).toEqual([2]);
    // One picked up already, its pick-up in flight, is not sent again.
    expect(pickUpsOf(sim, 0, standing(2), new Set([1]))).toEqual([3]);
    expect(pickUpsOf(sim, 0, standing(4), new Set())).toEqual([]);
  });

  it('leaves a stack the hero just dropped itself', () => {
    const sim = room();
    const slice = sim.world.slices.items as { floor: unknown[]; ticks: number };
    slice.floor.push({ id: 1, item: 'scrap', count: 3, cell: at(2, 2), by: 0, at: slice.ticks });
    expect(pickUpsOf(sim, 0, standing(2), new Set())).toEqual([]);
    expect(pickUpsOf(sim, 1, standing(2), new Set())).toEqual([1]);
    for (let i = 0; i < FLOOR.ownPickupDelay; i++) sim.step([]);
    expect(pickUpsOf(sim, 0, standing(2), new Set())).toEqual([1]);
  });
});
