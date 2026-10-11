import type { RoomAir } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { airAlerts } from './alerts';

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

describe('air alerts', () => {
  it('raise nothing for rooms that cost nothing: aired with oxygen to spare, open with no vent', () => {
    expect(
      airAlerts([
        room({ status: 'aired', lasts: 1200 }),
        room({ status: 'venting' }),
        room({ problem: 'atmosphere.noVent' }),
        room({ problem: 'atmosphere.notPiped' }),
        room({ status: 'filling' }),
      ]),
    ).toEqual([]);
  });

  it('count each danger over all rooms: draining into space, short of the next leak, dry pipes', () => {
    const alerts = airAlerts([
      room({ status: 'venting', lasts: 4 }),
      room({ status: 'venting', lasts: 0 }),
      room({ status: 'aired', lasts: 0 }),
      room({ problem: 'atmosphere.dry' }),
    ]);
    expect(alerts.map((a) => a.id)).toEqual(['air.venting', 'air.runningOut', 'air.dry']);
    expect(alerts[0]?.text).toContain('2');
    expect(alerts[1]?.text).toContain('1');
  });
});
