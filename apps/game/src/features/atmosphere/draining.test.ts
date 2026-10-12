import type { RoomAir } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { draining } from './draining';

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

describe('draining rooms', () => {
  it('are the rooms venting through a piped vent, drained dry or not', () => {
    expect(
      draining([
        room({ room: 1, status: 'venting', lasts: 4 }),
        room({ room: 2, status: 'venting', lasts: 0 }),
        room({ room: 3, status: 'venting' }),
        room({ room: 4, status: 'aired', lasts: 0 }),
        room({ room: 5, problem: 'atmosphere.dry' }),
      ]),
    ).toEqual(new Set([1, 2]));
  });
});
