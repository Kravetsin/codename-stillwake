import { describe, expect, it } from 'vitest';
import { TOOLS } from './tools';

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
      'pipe',
      'valve',
      'tank',
      'vent',
      'deconstruct',
      'cancel',
    ]);
  });

  it('labels every tool with text, not a key', () => {
    expect(
      TOOLS.map((tool) => tool.label).filter((label) => /\b(tool|material)\.\w/.test(label)),
    ).toEqual([]);
  });
});
