import { describe, expect, it } from 'vitest';
import { chunkCount, chunkOf, emptySeen, staleChunks } from './chunks';
import type { Cells } from './draw';

function cells(
  width: number,
  height: number,
): Cells & { structure: number[]; conduit: number[]; back: number[] } {
  const size = width * height;
  return {
    width,
    height,
    structure: new Array<number>(size).fill(0),
    material: new Array<number>(size).fill(0),
    conduit: new Array<number>(size).fill(0),
    back: new Array<number>(size).fill(0),
  };
}

describe('grid chunks', () => {
  // 40×20 cells: chunks of 16 make a 3×2 block of chunks.
  const W = 40;
  const H = 20;

  it('numbers chunks row by row', () => {
    expect(chunkCount(W, H)).toBe(6);
    expect(chunkOf(W, 0)).toBe(0);
    expect(chunkOf(W, 39)).toBe(2);
    expect(chunkOf(W, 16 * W)).toBe(3);
    expect(chunkOf(W, 19 * W + 39)).toBe(5);
  });

  it('marks nothing stale when nothing changed since the last draw', () => {
    const c = cells(W, H);
    const seen = emptySeen(c);
    expect(staleChunks(seen, c).size).toBe(0);
  });

  it('marks only the chunk of a cell that changed', () => {
    const c = cells(W, H);
    const seen = emptySeen(c);
    c.structure[5 * W + 20] = 4; // a door, deep inside chunk 1
    expect([...staleChunks(seen, c)]).toEqual([1]);
    expect(staleChunks(seen, c).size).toBe(0);
    c.back[5 * W + 20] = 1; // and a wall behind it
    expect([...staleChunks(seen, c)]).toEqual([1]);
  });

  it('marks a neighbouring chunk when the change sits on its border', () => {
    const c = cells(W, H);
    const seen = emptySeen(c);
    c.conduit[15 * W + 15] = 1; // last row and column of chunk 0
    expect([...staleChunks(seen, c)].sort()).toEqual([0, 1, 3]);
  });
});
