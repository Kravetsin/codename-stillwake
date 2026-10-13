import { BUILDS, CABLE_COST, MACHINES, MATERIALS } from '@stillwake/content';
import { building, command, grid, parseLayout, power, stillwake } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { EN } from '../../i18n/en';
import { costLines } from '../../render/CostRow';
import { hand, overlayOn } from '../../session/ui';
import {
  cardAt,
  costOf,
  layersFor,
  overlayFor,
  planOut,
  POWER,
  putPlanAway,
  selected,
  tabFor,
  TABS,
  TOOLS,
} from './tools';

/** What a tool puts in the world, by the name the grid gives it, a wall by its material. */
const what = (tool: (typeof TOOLS)[number] | undefined) =>
  tool === undefined
    ? undefined
    : tool.kind !== 'place'
      ? tool.kind
      : tool.placement.kind === 'wall' || tool.placement.kind === 'backWall'
        ? `${tool.placement.kind}:${tool.placement.material}`
        : tool.placement.kind;
const card = (kind: string) => TOOLS.find((each) => what(each) === kind);

describe('the build menu', () => {
  it('has a card for everything the ship is built of, each on one tab', () => {
    const carded = TABS.flatMap((tab) => tab.tools.map(what));
    expect(new Set(carded).size).toBe(carded.length);
    expect(TABS.every((tab) => tab.tools.length > 0)).toBe(true);
    expect(carded.sort()).toEqual(
      [
        ...Object.keys(MATERIALS).flatMap((m) => [`wall:${m}`, `backWall:${m}`]),
        ...Object.keys(BUILDS),
        ...Object.keys(MACHINES),
        'cable',
      ].sort(),
    );
  });

  it('names every tab and tool, and says what each tool is for, in words, not keys', () => {
    for (const tab of TABS) expect(EN[`build.tab.${tab.id}`]).toBeDefined();
    for (const tool of TOOLS) {
      expect(tool.label).not.toMatch(/\b(tool|material)\.\w/);
      expect(EN[`tool.${tool.id}.about`]).toBeDefined();
    }
  });

  it('prices each card as the sim does, a cable at its own cost', () => {
    const q = stillwake.create(1).query(building);
    const door = card('door');
    const cable = card('cable');
    if (!door || !cable) throw new Error('no tool');
    expect(costOf(door, q.costFor)).toEqual(BUILDS.door.cost);
    expect(costOf(cable, q.costFor)).toEqual(CABLE_COST);
  });

  it('lays what is needed against what there is, item by item, short ones counted short', () => {
    expect(costLines({ scrap: 2, iron: 1 }, { scrap: 5 })).toEqual([
      { item: 'scrap', have: 5, need: 2 },
      { item: 'iron', have: 0, need: 1 },
    ]);
    expect(costLines({}, { scrap: 5 })).toEqual([]);
  });

  it('opens on the tab of the overlay that is on', () => {
    expect([tabFor(POWER), tabFor('pipes'), tabFor('atmosphere'), tabFor(undefined)]).toEqual([
      'power',
      'air',
      'air',
      undefined,
    ]);
    expect(TABS.map((tab) => tab.id)).toEqual(expect.arrayContaining(['power', 'air']));
  });
});

describe('the hand', () => {
  it('holds the plan while it is out, a card or none, the cable as the cable', () => {
    putPlanAway();
    expect(hand.get()).toBe('free');
    planOut.set(true);
    expect(hand.get()).toBe('plan');
    selected.set(card('floor'));
    expect(hand.get()).toBe('card');
    selected.set(undefined);
    expect([hand.get(), planOut.get()]).toEqual(['plan', true]);
    selected.set(card('cable'));
    expect(hand.get()).toBe('cable');
    putPlanAway();
    expect([hand.get(), planOut.get(), selected.get()]).toEqual(['free', false, undefined]);
  });

  it('takes the plan out with a card picked while it is away, as the middle button does', () => {
    putPlanAway();
    selected.set(card('lamp'));
    expect([hand.get(), planOut.get()]).toEqual(['card', true]);
    putPlanAway();
  });

  it('puts the plan away when freed from elsewhere: a hotbar slot picked', () => {
    selected.set(card('floor'));
    hand.set('free');
    expect([hand.get(), planOut.get(), selected.get()]).toEqual(['free', false, undefined]);
  });

  it("shows each card's overlay, or none, and gives back the one before once the plan is away", () => {
    const shown = (kind: string) => {
      const each = card(kind);
      return each && overlayFor(each);
    };
    expect(['wall:iron', 'floor', 'door', 'crate', 'furnace'].map(shown)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(['pipe', 'valve', 'vent', 'tank', 'generator'].map(shown)).toEqual(
      Array(5).fill('pipes'),
    );
    expect(['cable', 'lamp', 'solarPanel'].map(shown)).toEqual(Array(3).fill(POWER));

    putPlanAway();
    overlayOn.set('atmosphere');
    selected.set(card('pipe'));
    expect(overlayOn.get()).toBe('pipes');
    selected.set(card('floor'));
    expect(overlayOn.get()).toBeUndefined();
    selected.set(card('lamp'));
    expect(overlayOn.get()).toBe(POWER);
    // A card let go keeps what is shown while the plan is out; the plan away gives back the one before.
    selected.set(undefined);
    expect(overlayOn.get()).toBe(POWER);
    putPlanAway();
    expect(overlayOn.get()).toBe('atmosphere');
    overlayOn.set(undefined);
  });

  it('keeps any card but the cable under any overlay; the cable goes with the power overlay', () => {
    selected.set(card('wall:iron'));
    overlayOn.set(POWER);
    expect(what(selected.get())).toBe('wall:iron');
    selected.set(card('cable'));
    expect(overlayOn.get()).toBe(POWER);
    // Another overlay, or none, puts the cable away and stays; the plan stays out.
    overlayOn.set('pipes');
    expect([selected.get(), overlayOn.get(), hand.get()]).toEqual([undefined, 'pipes', 'plan']);
    selected.set(card('cable'));
    overlayOn.set(undefined);
    expect([selected.get(), overlayOn.get()]).toEqual([undefined, undefined]);
    putPlanAway();
  });
});

describe('the overlay as a filter', () => {
  it('removes and picks pipes under the pipes overlay, and what the ship is built of elsewhere', () => {
    expect(layersFor('pipes')).toEqual(['conduit']);
    expect(layersFor(undefined)).toEqual(['machine', 'structure', 'back']);
    expect(layersFor('atmosphere')).toEqual(layersFor(undefined));
  });

  it("picks the card of what is under the pointer: a plan first, then what is built, in the overlay's layers", () => {
    // Seven cells wide: cell (x, y) is y * 7 + x. A tank at 8; a pipe at 11; open cells behind
    // walls; a cable along the top, from the hull's corner at 0 to 6.
    const rows = ['#######', '#TT -.#', '#TT...#', '#######'];
    const top = [
      [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
      ],
    ] as const;
    const sim = stillwake.create(1, parseLayout(rows, undefined, top));
    const q = () => ({
      grid: sim.query(grid),
      building: sim.query(building),
      power: sim.query(power),
    });
    const pick = (cell: number, overlay?: string) => what(cardAt(cell, overlay, q()));
    const hull = sim.query(grid).structureAt(0);
    expect(pick(0)).toBe(`wall:${hull.kind === 'wall' ? hull.material : ''}`);
    expect(pick(9)).toBe('tank');
    expect(pick(11)).toBe('backWall:scrap');
    expect(pick(11, 'pipes')).toBe('pipe');
    expect(pick(10, 'pipes')).toBeUndefined();
    sim.step([
      command(building, 'placePlan', { cell: 12, placement: { layer: 'structure', kind: 'door' } }),
    ]);
    expect(pick(12)).toBe('door');
    // Under the power overlay, the cable on a node a cable ends at; nothing on one with none.
    expect(pick(0, POWER)).toBe('cable');
    expect(pick(14, POWER)).toBeUndefined();
  });
});
