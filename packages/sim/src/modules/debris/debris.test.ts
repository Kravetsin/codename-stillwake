import { DEBRIS, INVENTORY, ITEMS, LOOT, type ItemId, type LootEntry } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { parseLayout, type Layout } from '../../core/layout';
import { createRng } from '../../core/rng';
import { defineSim } from '../../core/sim';
import { builder } from '../../testing/builder';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import { crew, items, MODULES, stillwake as world } from '../index';
import { cellOf, debris, lootOf, type Piece } from './index';

const withBuilder = defineSim([...MODULES, builder]);

/**
 * Twenty wide and eight tall: a room on the left from top to bottom, space right of it. Pieces
 * spawn at the right edge, past which their lead would take them, in any row.
 */
const SPACE = parseLayout([
  ' #####              ',
  ' #...#              ',
  ' #...#              ',
  ' #.S.#              ',
  ' #...#              ',
  ' #...#              ',
  ' #...#              ',
  ' #####              ',
]);
const WIDTH = 20;
const at = (x: number, y: number) => y * WIDTH + x;

/**
 * Space all round a small hull, wide and tall enough that neither its lead nor its margin reaches
 * the grid's edges: the hull spans columns 70 to 75 and rows 25 to 30.
 */
const ROOMY = parseLayout(
  Array.from({ length: 60 }, (_, y) =>
    y >= 25 && y <= 30 ? `${' '.repeat(70)}######`.padEnd(160) : ' '.repeat(160),
  ),
);

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
/** What catching a piece of `item` may give: itself, or a container's loot. */
const gives = (item: ItemId): readonly ItemId[] =>
  (LOOT as Partial<Record<ItemId, readonly LootEntry[]>>)[item]?.map((e) => e.item) ?? [item];
const count = (w: Scenario, item: string, peer: number) =>
  w
    .query(items)
    .inventory(peer)
    .reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
/** Every piece seen in `ticks` ticks, by id, as it was when first seen. */
function watch(w: Scenario, ticks: number): Map<number, Piece> {
  const seen = new Map<number, Piece>();
  for (let i = 0; i < ticks; i++) {
    w.run();
    for (const p of pieces(w)) if (!seen.has(p.id)) seen.set(p.id, { ...p });
  }
  return seen;
}

describe('debris', () => {
  it('spawns its first piece on its beat, its lead right of the hull, gone its lead left of it', () => {
    const w = scenario(world, ROOMY).run(DEBRIS.every - 1);
    expect(pieces(w)).toEqual([]);
    w.run();
    const [piece] = pieces(w);
    const start = (75 + DEBRIS.lead) * 1000 + 500;
    expect(piece).toMatchObject({ id: 1, x: start, start, end: (70 - DEBRIS.lead) * 1000 });
    expect(DEBRIS.kinds.map((k) => k.item)).toContain(piece?.item);
  });

  it('keeps where a piece spawns and is gone on the grid', () => {
    const [piece] = pieces(spawned());
    expect(piece).toMatchObject({ start: 19500, end: 0, x: 19500 });
  });

  it("flies in the hull's rows and its margin, and in every one of them", () => {
    const rows = new Set([...watch(scenario(world, ROOMY), 40000).values()].map((p) => p.y));
    const top = 25 - DEBRIS.margin;
    const bottom = 30 + DEBRIS.margin;
    expect([...rows].sort((a, b) => a - b)).toEqual(
      Array.from({ length: bottom - top + 1 }, (_, i) => (top + i) * 1000 + 500),
    );
  });

  it('follows a ship grown taller, found again on every beat', () => {
    const w = scenario(withBuilder, ROOMY);
    const wall = { layer: 'structure', kind: 'wall', material: 'scrap' } as const;
    w.do(builder, 'place', { cell: 55 * 160 + 72, placement: wall }).run();
    const rows = [...watch(w, 20000).values()].map((p) => Math.floor(p.y / 1000));
    expect(Math.max(...rows)).toBe(59);
    expect(Math.min(...rows)).toBe(25 - DEBRIS.margin);
  });

  it('drifts each piece by a speed of its own within the range, and drops it at its end', () => {
    const w = spawned(ROOMY);
    // A copy: what the query hands out is live.
    const piece = { ...(pieces(w)[0] as Piece) };
    w.run();
    expect(pieces(w)[0]?.x).toBe(piece.x - piece.speed);
    const ticks = Math.floor((piece.x - piece.end) / piece.speed) + 1;
    w.run(ticks - 2);
    expect(pieces(w).find((p) => p.id === piece.id)).toBeDefined();
    w.run();
    expect(pieces(w).find((p) => p.id === piece.id)).toBeUndefined();

    const speeds = new Set([...watch(scenario(world, ROOMY), 20000).values()].map((p) => p.speed));
    for (const speed of speeds) {
      expect(speed >= DEBRIS.drift.min && speed <= DEBRIS.drift.max).toBe(true);
    }
    expect(speeds.size).toBeGreaterThan(3);
  });

  it('spawns nothing without a hull', () => {
    const w = scenario(world, parseLayout(Array<string>(8).fill(' '.repeat(20)))).run(1000);
    expect(pieces(w)).toEqual([]);
  });

  it('spawns again within its beat and jitter, never more than its cap, with ids never reused', () => {
    // A hull so wide that pieces stay out long enough to reach the cap.
    const long = parseLayout(
      Array.from({ length: 8 }, (_, y) => (y === 4 ? `${' '.repeat(75)}${'#'.repeat(151)}` : '')),
    );
    const w = scenario(world, long);
    let last = 0;
    let spawns = 0;
    let gap: number = DEBRIS.every;
    let peak = 0;
    const gaps = new Set<number>();
    for (let tick = 1; tick <= 8000; tick++) {
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
      }
      gap += 1;
      peak = Math.max(peak, out.length);
      expect(out.length).toBeLessThanOrEqual(DEBRIS.max);
      expect(out.map((p) => p.id)).toEqual([...out.map((p) => p.id)].sort((a, b) => a - b));
      for (const p of out) expect(p.x >= p.end && p.x <= p.start && p.y < 8000).toBe(true);
    }
    expect(peak).toBe(DEBRIS.max);
    // The jitter at work: beats of more than one length.
    expect(gaps.size).toBeGreaterThan(1);
  });

  it('draws every kind, the heavier ones more often', () => {
    // Short paths and no cap reached: about a hundred spawns, each a draw.
    const kinds = [...watch(scenario(world, parseLayout(['   #   '])), 20000).values()].map(
      (p) => p.item,
    );
    const share = DEBRIS.kinds.map((k) => kinds.filter((item) => item === k.item).length);
    expect(share.every((n) => n > 0)).toBe(true);
    expect(share).toEqual([...share].sort((a, b) => b - a));
  });

  it('puts a piece grabbed from space into the inventory: salvage as itself, a container opened', () => {
    const w = spawned();
    const piece = pieces(w)[0];
    if (!piece) throw new Error('no piece');
    w.do(crew, 'enter', { cell: at(12, 1) }, 2)
      .do(debris, 'grab', { piece: piece.id }, 2)
      .run();
    expect(w.refusals).toEqual([]);
    expect(pieces(w)).toEqual([]);
    const got = w
      .query(items)
      .inventory(2)
      .filter((s) => s !== null);
    expect(got.length).toBeGreaterThan(0);
    for (const s of got) expect(gives(piece.item)).toContain(s.item);
    if (gives(piece.item)[0] === piece.item) expect(count(w, piece.item, 2)).toBe(1);
  });

  it('opens a container into its loot, each entry within its bounds, and salvage into itself', () => {
    const rng = createRng(7);
    const seen = new Map<ItemId, Set<number>>();
    for (let i = 0; i < 400; i++) {
      for (const [container, loot] of Object.entries(LOOT) as [ItemId, readonly LootEntry[]][]) {
        const got = lootOf(container, rng);
        for (const [item, n] of Object.entries(got) as [ItemId, number][]) {
          const entry = loot.find((e) => e.item === item);
          if (!entry) throw new Error(`${container} gave ${item}`);
          expect(n >= entry.min && n <= entry.max).toBe(true);
          seen.set(item, (seen.get(item) ?? new Set()).add(n));
        }
      }
    }
    // The planks a cargo crate holds come in every count of their range.
    const planks = LOOT.cargoCrate[0];
    expect(seen.get('planks')?.size).toBe(planks.max - planks.min + 1);
    expect(lootOf('scrapChunk', rng)).toEqual({ scrapChunk: 1 });
  });

  it('gives a piece grabbed twice on one tick to the first, and refuses the second', () => {
    const w = spawned();
    const id = pieces(w)[0]?.id ?? 0;
    w.do(crew, 'enter', { cell: at(12, 1) }, 1).do(crew, 'enter', { cell: at(13, 1) }, 2);
    w.do(debris, 'grab', { piece: id }, 2).do(debris, 'grab', { piece: id }, 1).run();
    expect(w.refusals).toEqual(['debris.gone']);
    expect(w.query(items).inventory(1).filter(Boolean)).toEqual([]);
    expect(w.query(items).inventory(2).filter(Boolean).length).toBeGreaterThan(0);
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

  it('takes a piece with no room for it, which floats where the hero is', () => {
    const w = spawned();
    const piece = pieces(w)[0];
    if (!piece) throw new Error('no piece');
    giveItems(w, 0, { canister: INVENTORY.slots * ITEMS.canister.stack });
    w.do(crew, 'enter', { cell: at(12, 1) })
      .do(debris, 'grab', { piece: piece.id })
      .run();
    expect(w.refusals).toEqual([]);
    expect(pieces(w)).toHaveLength(0);
    // In space nothing falls: it stays in the hero's cell for anyone to pick up.
    const floor = w.query(items).floor();
    expect(floor.length).toBeGreaterThan(0);
    for (const stack of floor) {
      expect(stack).toEqual(expect.objectContaining({ cell: at(12, 1), by: 0 }));
      expect(gives(piece.item)).toContain(stack.item);
    }
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
