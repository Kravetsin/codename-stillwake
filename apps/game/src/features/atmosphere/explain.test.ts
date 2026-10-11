import { AIR } from '@stillwake/content';
import { TICKS_PER_SECOND, type RoomAir } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { explain, span } from './explain';

const minute = 60 * TICKS_PER_SECOND;
const room = (air: Partial<RoomAir>): RoomAir => ({
  room: 1,
  status: 'vacuum',
  aired: 0,
  leak: 0,
  oxygen: 0,
  lasts: undefined,
  problem: undefined,
  ...air,
});

describe('what the air overlay says', () => {
  it('gives spans in seconds under a minute and whole minutes past it', () => {
    expect(span(1)).toBe('1 s');
    expect(span(59 * TICKS_PER_SECOND)).toBe('59 s');
    expect(span(6 * minute + 30 * TICKS_PER_SECOND)).toBe('6 min');
  });

  it('tells an aired room its leak and how long its pipes hold it, or that they are dry', () => {
    const aired = room({ status: 'aired', aired: 96, leak: 198, oxygen: 1280, lasts: 6 * minute });
    expect(explain(aired, 96)).toEqual([
      'Aired · 96 cells',
      `Leaks 198 every ${span(AIR.leakEvery)} through its hull`,
      'Its pipes hold 1280: enough for 6 min',
    ]);
    expect(explain({ ...aired, oxygen: 0, lasts: 0 }, 96)[2]).toBe(
      'Its pipes are dry: its air goes through the hull',
    );
  });

  it('tells a venting room how soon its pipes drain, if it has a piped vent to drain them', () => {
    const venting = room({ status: 'venting', oxygen: 450, lasts: 2 });
    expect(explain(venting, 96)).toEqual([
      'Venting · open to space',
      'Its pipes hold 450: drained in 1 s',
    ]);
    expect(explain({ ...venting, oxygen: 0, lasts: undefined }, 96)).toEqual([
      'Venting · open to space',
    ]);
  });

  it('tells a filling room how far it is, and a room in vacuum why', () => {
    expect(explain(room({ status: 'filling', aired: 40, oxygen: 900 }), 96)).toEqual([
      'Filling · 40 of 96 cells',
      'Its pipes hold 900',
    ]);
    expect(explain(room({ problem: 'atmosphere.dry' }), 48)).toEqual([
      'Vacuum · 48 cells',
      'Its pipes hold no oxygen: load a canister into a tank on them',
    ]);
  });
});
