import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { browserPlatform } from './browser';

describe('browser saves', () => {
  it('reads back what it wrote, across platform instances', async () => {
    await browserPlatform().saves.write('slot-a', '{"format":1}');
    expect(await browserPlatform().saves.read('slot-a')).toBe('{"format":1}');
  });

  it('overwrites a slot', async () => {
    const { saves } = browserPlatform();
    await saves.write('slot-b', 'first');
    await saves.write('slot-b', 'second');
    expect(await saves.read('slot-b')).toBe('second');
  });

  it('reads nothing from an empty slot', async () => {
    expect(await browserPlatform().saves.read('never-written')).toBeUndefined();
  });
});
