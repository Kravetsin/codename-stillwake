import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSaves } from './saves.js';

const fresh = async () =>
  createSaves(path.join(await mkdtemp(path.join(tmpdir(), 'saves-')), 'saves'));

describe('desktop saves', () => {
  it('read back what was written, overwrite a slot, and read nothing from an empty one', async () => {
    const saves = await fresh();
    expect(await saves.read('dev')).toBeUndefined();
    await saves.write('dev', 'first');
    await saves.write('dev', 'second');
    expect(await saves.read('dev')).toBe('second');
  });

  it('keep one file per slot and nothing left aside', async () => {
    const dir = path.join(await mkdtemp(path.join(tmpdir(), 'saves-')), 'saves');
    const saves = createSaves(dir);
    await saves.write('dev', '{}');
    await saves.write('desync', '{}');
    expect((await readdir(dir)).sort()).toEqual(['desync.json', 'dev.json']);
  });

  it('keep overlapping writes to one slot whole, the last one winning', async () => {
    const saves = await fresh();
    const long = 'x'.repeat(3_000_000);
    const short = 'y'.repeat(2_000_000);
    await Promise.all([saves.write('dev', long), saves.write('dev', short)]);
    expect(await saves.read('dev')).toBe(short);
  });

  it('refuse a slot name that is not a plain name', async () => {
    const saves = await fresh();
    expect(() => saves.write('../escape', 'x')).toThrow('not a save slot name');
    await expect(saves.read('a/b')).rejects.toThrow('not a save slot name');
  });
});
