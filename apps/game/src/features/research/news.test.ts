import { describe, expect, it } from 'vitest';
import { learnedSince } from './news';

describe('blueprints just learned', () => {
  it('are what is known now and was not at the last read', () => {
    expect(learnedSince(['crate', 'furnace'], ['crate', 'door', 'furnace', 'wallIron'])).toEqual([
      'door',
      'wallIron',
    ]);
    expect(learnedSince(['crate'], ['crate'])).toEqual([]);
  });

  it('are nothing at the first read, nor after a load that knows less', () => {
    expect(learnedSince(undefined, ['crate', 'furnace'])).toEqual([]);
    expect(learnedSince(['crate', 'door'], ['crate', 'furnace'])).toEqual([]);
  });
});
