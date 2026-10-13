import type { RoomAir } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { STREAM, streamsOf } from './streams';

const room = (over: Partial<RoomAir>): RoomAir => ({
  room: 0,
  status: 'venting',
  aired: 10,
  leak: 0,
  oxygen: 0,
  made: 0,
  lasts: undefined,
  problem: undefined,
  ...over,
});

// A five-wide strip; cells 0..4 on row 0 are space, the room's openings are on row 1.
const W = 5;
const H = 3;
const space = (cell: number) => cell < W;

describe('air streams', () => {
  it('stream out of a venting room holding air, heading into the space beside each opening', () => {
    const [up] = streamsOf([room({})], () => [W + 2], W, H, space);
    expect(up).toMatchObject({ x: 2.5, y: 1.5, perSecond: STREAM.perOpening });
    expect(up?.heading).toBeCloseTo(-Math.PI / 2);
    // Out over the grid's edge, to the left.
    const [left] = streamsOf(
      [room({})],
      () => [W],
      W,
      H,
      () => false,
    );
    expect(left?.heading).toBeCloseTo(Math.PI);
  });

  it('leave a room open to space with no air in it quiet, and one aired and sealed too', () => {
    expect(streamsOf([room({ aired: 0 })], () => [W + 2], W, H, space)).toEqual([]);
    // Its vents still pouring oxygen in, from tanks or a generator, it streams with no air held.
    expect(streamsOf([room({ aired: 0, lasts: 600 })], () => [W + 2], W, H, space)).toHaveLength(1);
    expect(streamsOf([room({ aired: 0, made: 200 })], () => [W + 2], W, H, space)).toHaveLength(1);
    expect(streamsOf([room({ status: 'aired' })], () => [W + 2], W, H, space)).toEqual([]);
  });

  it('thin out over many openings, a room giving off no more than its most', () => {
    const openings = Array.from({ length: 40 }, (_, i) => W + (i % W));
    const streams = streamsOf([room({})], () => openings, W, H, space);
    const total = streams.reduce((sum, s) => sum + s.perSecond, 0);
    expect(total).toBeCloseTo(STREAM.perRoom);
  });

  it('have no heading through a missing back wall, with no space beside', () => {
    const [behind] = streamsOf(
      [room({})],
      () => [W + 2],
      W,
      H,
      () => false,
    );
    expect(behind?.heading).toBeUndefined();
  });
});
