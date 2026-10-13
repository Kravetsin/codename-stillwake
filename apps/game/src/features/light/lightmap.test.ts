import { LIGHT } from '@stillwake/content';
import { BACK, STRUCTURE } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { darknessOf, lampLevel, shine, starsOf, type Lit } from './lightmap';

/**
 * A grid from rows: '#' a wall, 'D' a closed door, 'd' an open one, '.' an open cell with a back
 * wall, ' ' one without, starlit.
 */
function gridOf(rows: readonly string[]): Lit {
  const width = rows[0]?.length ?? 0;
  const cells = rows.join('');
  const code = { '#': STRUCTURE.wall, D: STRUCTURE.doorClosed, d: STRUCTURE.doorOpen };
  return {
    width,
    height: rows.length,
    structure: [...cells].map((c) => code[c as keyof typeof code] ?? STRUCTURE.empty),
    back: [...cells].map((c) => (c === ' ' ? BACK.none : BACK.wall)),
  };
}

const lit = (grid: Lit, sources: { cell: number; level: number }[]) => {
  const light = new Uint8Array(grid.width * grid.height);
  shine(light, grid, sources);
  return light;
};

describe('light', () => {
  it('falls off a cell at a time from a lamp, slower straight than on a diagonal', () => {
    const g = gridOf(['.....', '.....', '.....']);
    const light = lit(g, [{ cell: 7, level: 200 }]);
    expect(light[7]).toBe(200);
    expect(light[6]).toBe(200 - LIGHT.falloff);
    expect(light[5]).toBe(200 - 2 * LIGHT.falloff);
    expect(light[1]).toBe(200 - LIGHT.diagonal);
  });

  it('lights a wall but passes nothing through it, nor through a closed door', () => {
    const light = lit(gridOf(['..#..', '..D..', '..#..']), [{ cell: 0, level: 200 }]);
    expect(light[2]).toBeGreaterThan(0);
    expect(light[7]).toBeGreaterThan(0);
    for (const beyond of [3, 4, 8, 9, 13, 14]) expect(light[beyond]).toBe(0);
  });

  it('lets light by through an open door, never round a wall corner on a diagonal', () => {
    const light = lit(gridOf(['..#..', '..d..', '..#..']), [{ cell: 5, level: 200 }]);
    expect(light[8]).toBe(200 - 3 * LIGHT.falloff);
    // Past the doorway's corner a diagonal step would cut through the wall: it goes round.
    expect(light[3]).toBe(200 - 4 * LIGHT.falloff);
  });

  it('never leaves a cell darker than it was, the brightest way winning', () => {
    const g = gridOf(['.....']);
    const light = lit(g, [
      { cell: 0, level: 100 },
      { cell: 4, level: 200 },
    ]);
    expect(light[3]).toBe(200 - LIGHT.falloff);
    expect(light[0]).toBe(Math.max(100, 200 - 4 * LIGHT.falloff));
  });

  it('comes from the stars wherever there is no back wall, and from nowhere else', () => {
    const g = gridOf(['  #...', '  #. .']);
    const stars = starsOf(g).map((s) => s.cell);
    expect(stars).toEqual([0, 1, 6, 7, 10]);
    const light = lit(g, starsOf(g));
    expect(light[0]).toBe(LIGHT.star);
    // Through the hole in the back wall, beside it, a cell less bright.
    expect(light[9]).toBe(LIGHT.star - LIGHT.falloff);
  });

  it('dims a lamp short of power, and leaves an unpowered one dark', () => {
    expect(lampLevel(1000)).toBe(LIGHT.lamp);
    expect(lampLevel(555)).toBeLessThan(LIGHT.lamp * 0.6);
    expect(lampLevel(0)).toBe(0);
  });

  it('covers the dark with black, never quite all of it, and the lit with none', () => {
    expect(darknessOf(0)).toBe(Math.round((255 * LIGHT.darkest) / 1000));
    expect(darknessOf(LIGHT.full)).toBe(0);
    expect(darknessOf(LIGHT.full / 2)).toBeLessThan(darknessOf(0));
  });
});
