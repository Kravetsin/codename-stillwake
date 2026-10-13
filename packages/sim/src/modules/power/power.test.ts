import { AIR, CABLE_COST, INVENTORY, ITEMS, POWER } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseLayout, type Point } from '../../core/layout';
import { defineSim } from '../../core/sim';
import { builder } from '../../testing/builder';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import { atmosphere, building, grid, items, MODULES } from '../index';
import { power } from './index';

const world = defineSim([...MODULES, builder]);

/**
 * Sixteen wide: a solar panel out in space above a sealed room, its generator piped to a vent. Two
 * rows of space between; the room's right wall is past a span from the generator.
 */
const ROWS = [
  'PPP             ',
  '                ',
  '################',
  '#GG.GG.........#',
  '#GGVGG.........#',
  '################',
];
const UNDER = ['', '', '', '', ' ---'];
const at = (x: number, y: number) => y * 16 + x;
const PANEL = at(0, 0);
const GEN = at(1, 3);
const SECOND = at(4, 3);
type Pairs = readonly (readonly [Point, Point])[];
const TO_FIRST: Pairs = [
  [
    { x: 0, y: 0 },
    { x: 1, y: 3 },
  ],
];

const map = (cables: Pairs = TO_FIRST, rows = ROWS) => parseLayout(rows, UNDER, cables);
const idAt = (w: Scenario, cell: number) => w.query(grid).machineAt(cell)?.id ?? 0;
const scrap = (w: Scenario, peer = 0) =>
  w
    .query(items)
    .inventory(peer)
    .reduce((sum, s) => sum + (s?.item === 'scrap' ? s.count : 0), 0);
const store = (w: Scenario, cell: number) => w.query(atmosphere).oxygenIn(idAt(w, cell));

describe('power', () => {
  it('joins the cables a map lays, its panel out in space feeding the generator in full', () => {
    const w = scenario(world, map());
    const q = w.query(power);
    expect(q.cables()).toEqual([{ a: PANEL, b: GEN, paid: true }]);
    expect(q.networks()).toEqual([
      { id: PANEL, nodes: [PANEL, GEN], supply: 5, demand: 4, satisfaction: 1000 },
    ]);
    expect(q.satisfaction(idAt(w, GEN))).toBe(1000);
    // The second generator, cabled to nothing, gets nothing.
    expect(q.satisfaction(idAt(w, SECOND))).toBe(0);
  });

  it('lays a cable from any cell of a machine to an anchor on a wall, paid by the sender', () => {
    const w = giveItems(scenario(world, map()), 0, { scrap: 10 });
    w.do(power, 'lay', { a: at(2, 4), b: at(0, 3) }).run();
    expect(w.refusals).toEqual([]);
    expect(w.query(power).cables()).toContainEqual({ a: at(0, 3), b: GEN, paid: true });
    expect(scrap(w)).toBe(10 - (CABLE_COST.scrap ?? 0));
    expect(w.query(power).networks()[0]?.nodes).toEqual([PANEL, at(0, 3), GEN]);
  });

  it('refuses a cable to no node, to the same node, past a span, twice, or unpaid', () => {
    const w = giveItems(scenario(world, map()), 0, { scrap: 10 });
    w.do(power, 'lay', { a: GEN, b: at(8, 1) }).run(); // open space, nothing to mount on
    w.do(power, 'lay', { a: GEN, b: at(3, 4) }).run(); // a vent draws no power
    w.do(power, 'lay', { a: at(1, 3), b: at(2, 4) }).run();
    w.do(power, 'lay', { a: GEN, b: at(15, 3) }).run();
    w.do(power, 'lay', { a: GEN, b: PANEL }).run();
    w.do(power, 'lay', { a: GEN, b: SECOND }, 1).run();
    expect(w.refusals).toEqual([
      'power.noNode',
      'power.noNode',
      'power.sameNode',
      'power.tooLong',
      'power.twice',
      'items.notEnough',
    ]);
    expect(w.query(power).cables()).toHaveLength(1);
    expect(at(15, 3) - at(2, 3)).toBeGreaterThan(POWER.maxSpan);
  });

  it('cuts a cable, giving back what was paid; the generator, cut off, gets nothing', () => {
    const w = scenario(world, map());
    w.do(power, 'cut', { a: GEN, b: PANEL }).run();
    expect(w.refusals).toEqual([]);
    expect(w.query(power).cables()).toEqual([]);
    expect(scrap(w)).toBe(CABLE_COST.scrap);
    expect(w.query(power).satisfaction(idAt(w, GEN))).toBe(0);
    w.do(power, 'cut', { a: GEN, b: PANEL }).run();
    expect(w.refusals).toEqual(['power.noCable']);
  });

  it('refuses a cut whose refund does not fit, and gives nothing back for one laid for free', () => {
    const w = giveItems(scenario(world, map()), 1, {
      scrap: INVENTORY.slots * ITEMS.scrap.stack,
    });
    w.do(power, 'cut', { a: PANEL, b: GEN }, 1).run();
    expect(w.refusals).toEqual(['items.full']);
    w.do(items, 'setCreative', { on: true }).run();
    w.do(power, 'lay', { a: GEN, b: at(0, 3) }, 2).run();
    expect(w.query(power).cables()).toContainEqual({ a: at(0, 3), b: GEN, paid: false });
    w.do(power, 'cut', { a: GEN, b: at(0, 3) }, 2).run();
    expect(scrap(w, 2)).toBe(0);
  });

  it('makes nothing from a panel inside a room', () => {
    const inside = [
      '                ',
      '################',
      '#PPP...........#',
      '#GG............#',
      '#GG............#',
      '################',
    ];
    const w = scenario(
      world,
      map(
        [
          [
            { x: 1, y: 2 },
            { x: 1, y: 3 },
          ],
        ],
        inside,
      ),
    );
    expect(w.query(power).networks()[0]).toMatchObject({ supply: 0, demand: 4, satisfaction: 0 });
  });

  it('slows every user alike when short: two generators on one panel get 625‰', () => {
    const both: Pairs = [
      ...TO_FIRST,
      [
        { x: 0, y: 0 },
        { x: 4, y: 3 },
      ],
    ];
    const w = scenario(world, map(both));
    expect(w.query(power).networks()[0]).toMatchObject({ supply: 5, demand: 8, satisfaction: 625 });
    expect(w.query(power).satisfaction(idAt(w, SECOND))).toBe(625);
    // Unpiped, the second keeps all it makes: 125 a minute, twenty units in 192 ticks.
    const ticks = 192;
    w.run(ticks);
    expect(store(w, SECOND)).toBe(Math.floor((ticks * AIR.generatorRate * 625) / 1000 / 1200));
    expect(store(w, SECOND)).toBe(20);
  });

  it('runs a generator at full power at its rate, its fraction carried', () => {
    const w = scenario(world, parseLayout(ROWS, [], TO_FIRST));
    w.run(192);
    // Two hundred a minute: one every six ticks.
    expect(store(w, GEN)).toBe(32);
  });

  it('keeps a cabled machine from being taken apart, marked or cabled after its mark', () => {
    const w = scenario(world, map());
    w.do(building, 'deconstruct', { cell: GEN, layer: 'machine' }).run();
    expect(w.refusals).toEqual(['building.cabled']);
    w.do(power, 'cut', { a: GEN, b: PANEL }).run();
    w.do(building, 'deconstruct', { cell: GEN, layer: 'machine' }).run();
    const plan = w.query(building).plans()[0]?.id ?? 0;
    w.do(power, 'lay', { a: GEN, b: PANEL }).run();
    w.do(building, 'work', { plan }).run();
    expect(w.refusals).toEqual(['building.cabled', 'building.cabled']);
    expect(w.query(grid).machineAt(GEN)?.kind).toBe('generator');
  });

  it('keeps cables between distinct nodes in span, once each, and satisfaction what supply allows', () => {
    const cell = fc.integer({ min: 0, max: 16 * 6 - 1 });
    const step = fc.record({
      lay: fc.boolean(),
      a: cell,
      b: cell,
      peer: fc.integer({ min: 0, max: 1 }),
    });
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40, size: 'max' }), (steps) => {
        const w = giveItems(scenario(world, map()), 0, { scrap: 40 });
        for (const s of steps) {
          w.do(power, s.lay ? 'lay' : 'cut', { a: s.a, b: s.b }, s.peer);
          // Now and then a wall goes, an anchor's or the panel's shade.
          if (s.a % 7 === 0) w.do(builder, 'clear', { cell: s.b, layer: 'structure' });
          w.run();
        }
        const q = w.query(power);
        const cables = q.cables();
        const ends = cables.map((c) => `${c.a}-${c.b}`);
        if (new Set(ends).size !== ends.length) return false;
        if (cables.some((c) => c.a >= c.b)) return false;
        for (const n of q.networks()) {
          if (n.satisfaction < 0 || n.satisfaction > 1000) return false;
          if (Math.floor((n.demand * n.satisfaction) / 1000) > n.supply) return false;
        }
        return true;
      }),
      { numRuns: 60 },
    );
  });
});
