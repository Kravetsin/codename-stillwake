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
  made: 0,
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

  it('tells an aired room how long its pipes hold it, its leak counted in, or that they are dry', () => {
    const aired = room({ status: 'aired', aired: 96, leak: 198, oxygen: 1280, lasts: 6 * minute });
    expect(explain(aired, 96)).toEqual(['Aired · 96 cells', 'O₂ in pipes: 1280 · lasts 6 min']);
    // With no supply, its own 96 cells go through the hull: 96 of 198 a minute.
    expect(explain({ ...aired, oxygen: 0, lasts: 0 }, 96)[1]).toBe('No supply · lasts 30 s');
  });

  it('counts who breathes in the room, a unit a breath, into how long the air lasts', () => {
    const aired = room({ status: 'aired', aired: 96, leak: 198, oxygen: 1280 });
    // 198 leaked and 60 breathed a minute: 1280 last a little under five minutes.
    expect(explain(aired, 96, 1)[1]).toBe('O₂ in pipes: 1280 · lasts 4 min');
    expect(explain({ ...aired, leak: 0 }, 96)[1]).toBe('O₂ in pipes: 1280 · lasts ∞');
  });

  it('tells a room holding air with no supply how much it holds and how long it lasts', () => {
    expect(explain(room({ aired: 30, leak: 60, problem: 'atmosphere.noVent' }), 48)).toEqual([
      'Some air · 30/48 cells',
      'No supply · lasts 30 s',
      'No vent here',
    ]);
  });

  it('tells a room fed by a generator whether it keeps up, and how long the air lasts if not', () => {
    const fed = room({ status: 'aired', aired: 32, leak: 48, oxygen: 40, made: 200 });
    // 200 made, 48 leaked and 60 breathed a minute each: 32 to spare with two, 28 short with three.
    expect(explain(fed, 32, 2)).toEqual(['Aired · 32 cells', 'Generator keeps up · +32/min']);
    expect(explain(fed, 32, 3)[1]).toBe('Generator falls short · lasts 2 min');
    expect(explain({ ...fed, status: 'filling', aired: 10 }, 32)).toEqual([
      'Filling · 10/32 cells',
      'Generator keeps up · +152/min',
    ]);
  });

  it('tells a venting room how soon its pipes drain, if it has a piped vent to drain them', () => {
    const venting = room({ status: 'venting', oxygen: 450, lasts: 2 });
    expect(explain(venting, 96)).toEqual(['Venting to space', 'O₂ in pipes: 450 · gone in 1 s']);
    expect(explain({ ...venting, oxygen: 0, lasts: undefined }, 96)).toEqual(['Venting to space']);
  });

  it('tells a filling room how far it is, and a room in vacuum why', () => {
    expect(explain(room({ status: 'filling', aired: 40, oxygen: 900 }), 96)).toEqual([
      'Filling · 40/96 cells',
      'O₂ in pipes: 900',
    ]);
    expect(explain(room({ problem: 'atmosphere.dry' }), 48)).toEqual([
      'No air · 48 cells',
      'Pipes empty: load a canister into a tank',
    ]);
  });
});
