import { describe, expect, it } from 'vitest';
import { NEAR, nearGrid } from './near-grid';

const size = { width: 100, height: 100 };

describe('the grid near the pointer', () => {
  it('draws the edges of the cell under the pointer strongest, and fades to nothing at its reach', () => {
    const edges = nearGrid({ x: 50.5, y: 50.5 }, size);
    const own = edges.filter((e) => [e.x1, e.x2].every((x) => x === 50 || x === 51));
    const strongest = Math.max(...edges.map((e) => e.alpha));
    expect(edges.find((e) => e.x1 === 50 && e.y1 === 50 && e.x2 === 50)?.alpha).toBe(strongest);
    expect(own.length).toBeGreaterThan(0);
    for (const e of edges) {
      const d = Math.hypot((e.x1 + e.x2) / 2 - 50.5, (e.y1 + e.y2) / 2 - 50.5);
      expect(d).toBeLessThan(NEAR);
      expect(e.alpha).toBeGreaterThan(0);
    }
    const far = edges.filter((e) => Math.abs(e.x1 - 50) > 3);
    expect(Math.max(...far.map((e) => e.alpha))).toBeLessThan(strongest);
  });

  it('draws nothing past the edges of the grid', () => {
    for (const e of nearGrid({ x: 0.5, y: 99.5 }, size)) {
      expect(Math.min(e.x1, e.x2)).toBeGreaterThanOrEqual(0);
      expect(Math.max(e.y1, e.y2)).toBeLessThanOrEqual(100);
    }
  });
});
