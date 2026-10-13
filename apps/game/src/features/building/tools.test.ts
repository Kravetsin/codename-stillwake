import { describe, expect, it } from 'vitest';
import { overlayOn } from '../../session/ui';
import { selected, TOOLS } from './tools';

describe('the toolbar', () => {
  it('offers every type the plan names, deconstruction and cancelling', () => {
    expect(
      TOOLS.map((tool) =>
        tool.kind !== 'place'
          ? tool.kind
          : tool.placement.layer === 'structure' && tool.placement.kind === 'wall'
            ? `wall:${tool.placement.material}`
            : tool.placement.kind,
      ),
    ).toEqual([
      'wall:scrap',
      'wall:steel',
      'floor',
      'ladder',
      'door',
      'backWall',
      'pipe',
      'valve',
      'cable',
      'tank',
      'generator',
      'solarPanel',
      'vent',
      'crate',
      'furnace',
      'deconstruct',
      'cancel',
    ]);
  });

  it('labels every tool with text, not a key', () => {
    expect(
      TOOLS.map((tool) => tool.label).filter((label) => /\b(tool|material)\.\w/.test(label)),
    ).toEqual([]);
  });

  it('turns on the overlay a tool lays in, and gives back the one before once put away', () => {
    const tool = (kind: string) =>
      TOOLS.find((t) => (t.kind === 'place' ? t.placement.kind : t.kind) === kind);
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
});
