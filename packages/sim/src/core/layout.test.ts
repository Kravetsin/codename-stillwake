import { describe, expect, it } from 'vitest';
import { cellsOf, parseLayout } from './layout';

describe('parseLayout', () => {
  it('drops blank edge lines and common indentation, and pads short rows with space', () => {
    const layout = parseLayout(`
      ###
      #T
      ###
    `);
    expect(layout).toEqual({ width: 3, height: 3, rows: ['###', '#T ', '###'] });
  });

  it('keeps space that matters: indentation only some rows have', () => {
    expect(parseLayout(`\n  ##\n   #\n`).rows).toEqual(['##', ' #']);
  });

  it('refuses a character the legend does not know, saying where', () => {
    expect(() => parseLayout(`#?#`)).toThrow("Map cell (1, 0): '?' is not in the legend.");
  });

  it('parses an empty map', () => {
    expect(parseLayout('')).toEqual({ width: 0, height: 0, rows: [] });
  });
});

describe('cellsOf', () => {
  it('numbers cells row by row from the top-left', () => {
    const layout = parseLayout(`
      T.#
      #.T
    `);
    expect(cellsOf(layout, 'T')).toEqual([0, 5]);
    expect(cellsOf(layout, '.')).toEqual([1, 4]);
  });
});
