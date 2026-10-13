import { LIGHT } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { ALIGN, areaOf, MOST_PIXELS, runsOf } from './area';

describe('the area light is worked out over', () => {
  it('covers the screen and a margin round it, its corner on the grid of probes', () => {
    const view = { x: 10.4, y: 7.2, width: 60, height: 34 };
    const area = areaOf(view);
    expect(Math.abs(area.x % ALIGN)).toBe(0);
    expect(Math.abs(area.y % ALIGN)).toBe(0);
    expect(area.x).toBeLessThanOrEqual(view.x - LIGHT.margin);
    expect(area.y).toBeLessThanOrEqual(view.y - Math.min(LIGHT.margin, view.height / 2));
    expect(area.x + area.width).toBeGreaterThanOrEqual(view.x + view.width + LIGHT.margin);
    expect(area.perCell).toBe(LIGHT.perCell);
  });

  it('stays put while the camera moves within it, so its probes do not swim', () => {
    const at = (x: number) => areaOf({ x, y: 0, width: 60, height: 34 });
    expect(at(10.1)).toEqual(at(10.9));
  });

  it('takes fewer pixels a cell far out, never more pixels across than its most', () => {
    const area = areaOf({ x: 0, y: 0, width: 400, height: 220 });
    expect(area.perCell).toBeLessThan(LIGHT.perCell);
    expect(Math.max(area.width, area.height) * area.perCell).toBeLessThanOrEqual(MOST_PIXELS);
  });
});

describe('runs of cells', () => {
  it('join cells side by side in a row, never across rows', () => {
    // 3 wide: row 0 on, on, off; row 1 on, off, on.
    const on = new Set([0, 1, 3, 5]);
    expect(runsOf(3, 2, (c) => on.has(c))).toEqual([
      { x: 0, y: 0, length: 2 },
      { x: 0, y: 1, length: 1 },
      { x: 2, y: 1, length: 1 },
    ]);
  });
});
