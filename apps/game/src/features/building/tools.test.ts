import { BUILDS, CABLE_COST, MACHINES, MATERIALS } from '@stillwake/content';
import { building, stillwake } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { EN } from '../../i18n/en';
import { costLines } from '../../render/CostRow';
import { buildMode, overlayOn } from '../../session/ui';
import { costOf, menuOpen, putPlanAway, selected, TABS, TOOLS } from './tools';

/** What a tool puts in the world, by the name the grid gives it, a wall by its material. */
const what = (tool: (typeof TOOLS)[number]) =>
  tool.kind !== 'place'
    ? tool.kind
    : tool.placement.layer === 'structure' && tool.placement.kind === 'wall'
      ? `wall:${tool.placement.material}`
      : tool.placement.kind;

describe('the build menu', () => {
  it('has a card for everything the ship is built of, each on one tab, removing aside', () => {
    const carded = TABS.flatMap((tab) => tab.tools.map(what));
    expect(new Set(carded).size).toBe(carded.length);
    expect(TABS.every((tab) => tab.tools.length > 0)).toBe(true);
    expect(carded.sort()).toEqual(
      [
        ...Object.keys(MATERIALS).map((m) => `wall:${m}`),
        ...Object.keys(BUILDS),
        ...Object.keys(MACHINES),
        'cable',
      ].sort(),
    );
    expect(TOOLS.slice(-1).map(what)).toEqual(['remove']);
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
    const byId = (id: string) => TOOLS.find((tool) => tool.id === id);
    const door = byId('door');
    const cable = byId('cable');
    if (!door || !cable) throw new Error('no tool');
    expect(costOf(door, q.costFor)).toEqual(BUILDS.door.cost);
    expect(costOf(cable, q.costFor)).toEqual(CABLE_COST);
    for (const tool of TOOLS.filter((each) => each.kind !== 'place' && each.kind !== 'cable')) {
      expect(costOf(tool, q.costFor)).toEqual({});
    }
  });

  it('lays what is needed against what there is, item by item, short ones counted short', () => {
    expect(costLines({ scrap: 2, steel: 1 }, { scrap: 5 })).toEqual([
      { item: 'scrap', have: 5, need: 2 },
      { item: 'steel', have: 0, need: 1 },
    ]);
    expect(costLines({}, { scrap: 5 })).toEqual([]);
  });

  it('turns on the overlay a tool lays in, and gives back the one before once put away', () => {
    const tool = (kind: string) => TOOLS.find((each) => what(each) === kind);
    overlayOn.set('air');
    selected.set(tool('cable'));
    expect(overlayOn.get()).toBe('power');
    selected.set(tool('pipe'));
    expect(overlayOn.get()).toBe('pipes');
    selected.set(tool('floor'));
    expect(overlayOn.get()).toBe('air');
    selected.set(tool('valve'));
    selected.set(undefined);
    expect(overlayOn.get()).toBe('air');
  });

  it('holds the plan in hand while the menu is open or a tool is out, until put away', () => {
    putPlanAway();
    expect(buildMode.get()).toBe(false);
    menuOpen.set(true);
    expect(buildMode.get()).toBe(true);
    selected.set(TOOLS[0]);
    menuOpen.set(false);
    expect(buildMode.get()).toBe(true);
    putPlanAway();
    expect([buildMode.get(), menuOpen.get(), selected.get()]).toEqual([false, false, undefined]);
  });
});
