import { afterEach, describe, expect, it, vi } from 'vitest';
import { versionOf } from './build';
import { CHECK_MS, markResume, newBuild, servedBuild, takeResume, watchForUpdates } from './update';

const answer =
  (body: unknown, ok = true) =>
  () =>
    Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

afterEach(() => {
  vi.useRealTimers();
  newBuild.set(undefined);
});

describe('which build is out', () => {
  it('is read from version.json beside the page', async () => {
    expect(await servedBuild(answer({ build: 'abc1234', built: '2026-10-12' }))).toBe('abc1234');
  });

  it('is none when the server cannot say', async () => {
    expect(await servedBuild(answer({}, false))).toBeUndefined();
    expect(await servedBuild(answer({ build: 7 }))).toBeUndefined();
    expect(await servedBuild(() => Promise.reject(new Error('offline')))).toBeUndefined();
  });

  it('is asked every so often, and offered once it is not this page’s', async () => {
    vi.useFakeTimers();
    let out = 'abc1234';
    const stop = watchForUpdates('abc1234', () => Promise.resolve(out));
    await vi.advanceTimersByTimeAsync(CHECK_MS);
    expect(newBuild.get()).toBeUndefined();
    out = 'def5678';
    await vi.advanceTimersByTimeAsync(CHECK_MS);
    expect(newBuild.get()).toBe('def5678');
    stop();
  });
});

describe('reloading into a new build', () => {
  it('says once that this load resumes a saved world', () => {
    const kept = new Map<string, string>();
    const storage = {
      setItem: (k: string, v: string) => void kept.set(k, v),
      getItem: (k: string) => kept.get(k) ?? null,
      removeItem: (k: string) => void kept.delete(k),
    };
    expect(takeResume(storage)).toBe(false);
    markResume(storage);
    expect(takeResume(storage)).toBe(true);
    expect(takeResume(storage)).toBe(false);
  });

  it('starts anew without storage, rather than failing', () => {
    const broken = {
      setItem: () => {
        throw new Error('blocked');
      },
      getItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(() => markResume(broken)).not.toThrow();
    expect(takeResume(broken)).toBe(false);
  });
});

describe('the build in the corner', () => {
  it('reads as the day, the month and the commit', () => {
    expect(versionOf('680543f', '2026-10-12')).toBe('12.10 · 680543f');
    expect(versionOf('680543f+1a2b3c4', 'unknown')).toBe('680543f+1a2b3c4');
  });
});
