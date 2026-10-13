import { ITEMS, type ItemId } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { ITEM_ART, ITEM_PIXELS } from './item-art';

describe('item art', () => {
  it.each(Object.keys(ITEMS) as ItemId[])('%s is a picture, square, in its own colours', (item) => {
    const { rows, palette } = ITEM_ART[item];
    expect(rows).toHaveLength(ITEM_PIXELS);
    for (const row of rows) {
      expect(row).toHaveLength(ITEM_PIXELS);
      for (const char of row) if (char !== '.') expect(palette).toHaveProperty(char);
    }
  });
});
