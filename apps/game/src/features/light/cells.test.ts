import { LIGHT } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { bytesOf, KIND, lightOf, OPEN, type Cells } from './cells';

/**
 * Cells from rows: '.' air, '#' a wall, 'M' a machine, '*' air giving off white light, a whole
 * unit of each colour.
 */
function cellsOf(rows: readonly string[]): Cells {
  const width = rows[0]?.length ?? 0;
  const all = rows.join('');
  const kind = Uint8Array.from(
    [...all].map((c) => (c === '#' ? KIND.wall : c === 'M' ? KIND.machine : KIND.air)),
  );
  const gives = new Float32Array(all.length * 3);
  [...all].forEach((c, i) => {
    if (c === '*') gives.set([1, 1, 1], i * 3);
  });
  return { width, height: rows.length, kind, gives };
}

/** The red of cell (`x`, `y`). */
const red = (light: Float32Array, width: number, x: number, y: number) =>
  light[(y * width + x) * 3] ?? 0;

describe('light by cells', () => {
  it('fades by the air it crosses, round a corner too', () => {
    const light = lightOf(cellsOf(['*....', '####.', '.....']));
    expect(red(light, 5, 0, 0)).toBe(1);
    expect(red(light, 5, 2, 0)).toBeCloseTo(LIGHT.air ** 2);
    // Down past the wall's end and back along under it.
    expect(red(light, 5, 4, 2)).toBeCloseTo(LIGHT.air ** 6);
    expect(red(light, 5, 0, 2)).toBeCloseTo(LIGHT.air ** 10);
  });

  it('lights a wall it falls on, darker deeper in, and lets next to none through it', () => {
    const light = lightOf(cellsOf(['*.##..']));
    expect(red(light, 6, 2, 0)).toBeCloseTo(LIGHT.air * LIGHT.wallIn);
    expect(red(light, 6, 3, 0)).toBeCloseTo(LIGHT.air * LIGHT.wallIn * LIGHT.wallDeep);
    expect(red(light, 6, 4, 0)).toBeLessThan(0.02);
    // A wall a cell thick too.
    expect(red(lightOf(cellsOf(['*.#.'])), 4, 3, 0)).toBeLessThan(0.1);
  });

  it('dims through a machine more than through air', () => {
    const light = lightOf(cellsOf(['*M.', '*..']));
    expect(red(light, 3, 1, 0)).toBeLessThan(red(light, 3, 1, 1));
  });

  it('keeps each colour apart, the brightest way winning for each', () => {
    const cells = cellsOf(['.....']);
    cells.gives.set([1, 0, 0], 0);
    cells.gives.set([0, 0, 1], 4 * 3);
    const light = lightOf(cells);
    expect(light[2 * 3]).toBeCloseTo(LIGHT.air ** 2);
    expect(light[2 * 3 + 2]).toBeCloseTo(LIGHT.air ** 2);
    expect(light[0 * 3 + 2]).toBeCloseTo(LIGHT.air ** 4);
  });

  it('shows as bytes with the ambient light added, up to white, a wall marked in the alpha', () => {
    const bytes = new Uint8Array(8);
    bytesOf(Float32Array.from([0, 0, 0, 2, 2, 2]), Uint8Array.from([KIND.air, KIND.wall]), bytes);
    expect(bytes[0]).toBe(Math.floor(LIGHT.ambient[0] * 255));
    expect(bytes[3]).toBe(OPEN);
    expect([...bytes.slice(4, 8)]).toEqual([255, 255, 255, 255]);
  });
});
