import { describe, expect, it } from 'vitest';
import { cellsOf, machinesOf, parseLayout } from './layout';

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

  it('reads rows as written, keeping the space around a ship', () => {
    expect(parseLayout(['    ', ' ##', '   ']).rows).toEqual(['    ', ' ## ', '    ']);
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

describe('the map under', () => {
  it('is padded to the map and read by cellsOf', () => {
    const layout = parseLayout(['#TT#', '#TT#'], ['', ' -o']);
    expect(layout.under).toEqual(['    ', ' -o ']);
    expect(cellsOf(layout, '-', true)).toEqual([5]);
    expect(cellsOf(layout, 'o', true)).toEqual([6]);
    expect(cellsOf(parseLayout('#'), 'o', true)).toEqual([]);
  });

  it('refuses a character its legend does not know, or a map under larger than the map', () => {
    expect(() => parseLayout(['##'], ['#'])).toThrow(
      "Map cell (0, 0) under: '#' is not in the legend.",
    );
    expect(() => parseLayout(['##'], ['---'])).toThrow('larger than the map');
    expect(() => parseLayout(['##'], ['', ''])).toThrow('larger than the map');
  });
});

describe('machinesOf', () => {
  it('lists machines by their top-left cells in reading order, with the cells they cover', () => {
    const layout = parseLayout(`
      .VTT
      V.TT
    `);
    expect(machinesOf(layout)).toEqual([
      { kind: 'vent', cell: 1, cells: [1] },
      { kind: 'tank', cell: 2, cells: [2, 3, 6, 7] },
      { kind: 'vent', cell: 4, cells: [4] },
    ]);
  });
});
