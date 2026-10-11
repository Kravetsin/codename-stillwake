import { DEBRIS, INVENTORY, ITEMS } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { parseLayout, type Layout } from '../../core/layout';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import { crew, items, stillwake as world } from '../index';
import { cellOf, debris } from './index';

/**
 * Twenty wide and eight tall, so the band of rows debris flies in ends at the bottom two rows; a
 * room on the left reaches down into them.
 */
const SPACE = parseLayout([
  '                    ',
  '                    ',
  ' #####              ',
  ' #...#              ',
  ' #.S.#              ',
  ' #...#              ',
  ' #...#              ',
  ' #####              ',
]);
const WIDTH = 20;
const at = (x: number, y: number) => y * WIDTH + x;
const pieces = (w: Scenario) => w.query(debris).pieces();
/** The first piece, once `DEBRIS.every` ticks have spawned it. */
function spawned(map: Layout = SPACE): Scenario {
  const w = scenario(world, map).run(DEBRIS.every);
  expect(pieces(w)).toHaveLength(1);
  return w;
}
/** Runs until the first piece's middle is in column `x`. */
function until(w: Scenario, x: number): Scenario {
  while ((pieces(w)[0]?.x ?? 0) >= (x + 1) * 1000) w.run();
  return w;
}
const count = (w: Scenario, item: string, peer: number) =>
  w
    .query(items)
    .inventory(peer)
    .reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);

describe('debris', () => {
  it('spawns its first piece on its beat, at the right edge in a row of its band', () => {
    const w = scenario(world, SPACE).run(DEBRIS.every - 1);
    expect(pieces(w)).toEqual([]);
    w.run();
    const [piece] = pieces(w);
    expect(piece).toMatchObject({ id: 1, x: WIDTH * 1000 - 1 });
    expect([6500, 7500]).toContain(piece?.y);
    expect(DEBRIS.kinds.map((k) => k.item)).toContain(piece?.item);
  });

  it('drifts every piece left by the same amount a tick, and drops it past the left edge', () => {
    const w = spawned();
    w.run();
    expect(pieces(w)[0]?.x).toBe(WIDTH * 1000 - 1 - DEBRIS.drift);
    const ticks = Math.floor((WIDTH * 1000 - 1) / DEBRIS.drift) + 1;
    w.run(ticks - 2);
    expect(pieces(w)[0]?.x).toBeGreaterThanOrEqual(0);
    w.run();
    expect(pieces(w).filter((p) => p.id === 1)).toEqual([]);
  });

  it('spawns again within its beat and jitter, never more than its cap, with ids never reused', () => {
    // So wide that pieces stay out long enough to reach the cap.
    const w = scenario(world, parseLayout(Array<string>(8).fill(' '.repeat(200))));
    let last = 0;
    let spawns = 0;
    let gap: number = DEBRIS.every;
    let peak = 0;
    const gaps = new Set<number>();
    const kinds = new Set<string>();
    for (let tick = 1; tick <= 6000; tick++) {
      w.run();
      const out = pieces(w);
      const newest = out.at(-1);
      if (newest && newest.id > last) {
        expect(newest.id).toBe(last + 1);
        if (spawns > 0) expect(gap).toBeGreaterThanOrEqual(DEBRIS.every);
        if (spawns > 0 && out.length < DEBRIS.max) {
          expect(gap).toBeLessThanOrEqual(DEBRIS.every + DEBRIS.jitter);
        }
        last = newest.id;
        spawns += 1;
        // Until the cap is first reached no beat is skipped, so gaps are beats.
        if (spawns > 1 && peak < DEBRIS.max) gaps.add(gap);
        gap = 0;
        kinds.add(newest.item);
      }
      gap += 1;
      peak = Math.max(peak, out.length);
      expect(out.length).toBeLessThanOrEqual(DEBRIS.max);
      expect(out.map((p) => p.id)).toEqual([...out.map((p) => p.id)].sort((a, b) => a - b));
      for (const p of out) expect(p.x >= 0 && p.x < 200 * 1000 && p.y < 8000).toBe(true);
    }
    expect(peak).toBe(DEBRIS.max);
    // The jitter at work: beats of more than one length.
    expect(gaps.size).toBeGreaterThan(1);
    expect(kinds).toEqual(new Set(DEBRIS.kinds.map((k) => k.item)));
  });

  it('spawns in every row of its band on a map that holds it, and in none outside it', () => {
    const w = scenario(
      world,
      parseLayout(Array<string>(DEBRIS.rows.bottom + 4).fill(' '.repeat(8))),
    );
    const rows = new Set<number>();
    for (let i = 0; i < 60000; i++) {
      w.run();
      for (const p of pieces(w)) rows.add(Math.floor(p.y / 1000));
    }
    const { top, bottom } = DEBRIS.rows;
    expect([...rows].sort((a, b) => a - b)).toEqual(
      Array.from({ length: bottom - top + 1 }, (_, i) => top + i),
    );
  });

  it('puts a piece grabbed from space into the inventory as its salvage item', () => {
    const w = spawned();
    const piece = pieces(w)[0];
    if (!piece) throw new Error('no piece');
    w.do(crew, 'enter', { cell: at(12, 1) }, 2)
      .do(debris, 'grab', { piece: piece.id }, 2)
      .run();
    expect(w.refusals).toEqual([]);
    expect(pieces(w)).toEqual([]);
    expect(count(w, piece.item, 2)).toBe(1);
  });

  it('gives a piece grabbed twice on one tick to the first, and refuses the second', () => {
    const w = spawned();
    const id = pieces(w)[0]?.id ?? 0;
    w.do(crew, 'enter', { cell: at(12, 1) }, 1).do(crew, 'enter', { cell: at(13, 1) }, 2);
    w.do(debris, 'grab', { piece: id }, 2).do(debris, 'grab', { piece: id }, 1).run();
    expect(w.refusals).toEqual(['debris.gone']);
    expect(w.query(items).inventory(1).filter(Boolean)).toEqual([]);
    expect(w.query(items).inventory(2).filter(Boolean)).toHaveLength(1);
  });

  it('refuses a piece that never was or is gone', () => {
    const w = spawned()
      .do(crew, 'enter', { cell: at(12, 1) })
      .run();
    w.do(debris, 'grab', { piece: 7 }).run();
    w.run(WIDTH * 1000);
    w.do(debris, 'grab', { piece: 1 }).run();
    expect(w.refusals).toEqual(['debris.gone', 'debris.gone']);
  });

  it('refuses a grab unless both the hero and the piece are in space', () => {
    const w = spawned();
    const id = pieces(w)[0]?.id ?? 0;
    w.do(debris, 'grab', { piece: id }, 1).run();
    w.do(crew, 'enter', { cell: at(3, 4) }, 1)
      .do(debris, 'grab', { piece: id }, 1)
      .run();
    expect(w.refusals).toEqual(['debris.notOutside', 'debris.notOutside']);
    // Over the room's cells and walls the piece is not in space either.
    until(w, 4).do(crew, 'enter', { cell: at(12, 1) }, 1);
    expect(w.query(debris).grabProblem(1, id)).toBe('debris.notOutside');
    w.do(debris, 'grab', { piece: id }, 1).run();
    expect(w.refusals.at(-1)).toBe('debris.notOutside');
    expect(pieces(w).map((p) => p.id)).toContain(id);
  });

  it('refuses a piece with no room for it', () => {
    const w = spawned();
    const piece = pieces(w)[0];
    if (!piece) throw new Error('no piece');
    giveItems(w, 0, { canister: INVENTORY.slots * ITEMS.canister.stack });
    w.do(crew, 'enter', { cell: at(12, 1) })
      .do(debris, 'grab', { piece: piece.id })
      .run();
    expect(w.refusals).toEqual(['items.full']);
    expect(pieces(w)).toHaveLength(1);
  });

  it('finds the cell under a piece, and the piece in a cell', () => {
    expect(cellOf({ x: 2999, y: 1500 }, WIDTH)).toBe(at(2, 1));
    expect(cellOf({ x: 0, y: 0 }, WIDTH)).toBe(0);
    const w = spawned();
    const piece = pieces(w)[0];
    if (!piece) throw new Error('no piece');
    expect(w.query(debris).pieceAt(cellOf(piece, WIDTH))).toEqual(piece);
    expect(w.query(debris).pieceAt(cellOf(piece, WIDTH) - 1)).toBeUndefined();
  });
});
