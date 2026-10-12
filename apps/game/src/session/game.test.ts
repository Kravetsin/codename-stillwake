import { createClient, type ToClient } from '@stillwake/net';
import { defineSim, TICKS_PER_SECOND } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { createGame } from './game';

const FRAME_MS = 1000 / 60;
const TICK_MS = 1000 / TICKS_PER_SECOND;
const empty = defineSim([]);
const platform = {
  saves: { read: () => Promise.resolve(undefined), write: () => Promise.resolve() },
};

/**
 * A game joined to a host that is not here: ticks reach it when `arrival(tick)` says, in ms, and
 * frames run every FRAME_MS.
 */
function joined(arrival: (tick: number) => number) {
  let receive: (message: ToClient) => void = () => {};
  const client = createClient(
    empty.create(1),
    { send: () => {}, onMessage: (handler) => (receive = handler) },
    1,
  );
  const game = createGame(empty, platform, { client });
  let released = 0;
  let now = 0;
  return {
    game,
    client,
    /** Runs a frame, after the ticks due to arrive by then, and says how many it ran. */
    frame: () => {
      now += FRAME_MS;
      while (arrival(released) <= now) receive({ kind: 'tick', tick: released++, commands: [] });
      const before = client.sim.world.tick;
      game.frame(FRAME_MS);
      return client.sim.world.tick - before;
    },
  };
}

const frames = (n: number, frame: () => number) => Array.from({ length: n }, frame);
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

describe('a joined game', () => {
  it('holds a tick that came for a while before it runs it', () => {
    const { frame } = joined((tick) => (tick === 0 ? 0 : Infinity));
    // The reserve before anything is measured is 100 ms: six frames.
    expect(sum(frames(5, frame))).toBe(0);
    expect(sum(frames(5, frame))).toBe(1);
  });

  it('runs ticks that come in bursts one at a time, as the host released them', () => {
    // Three ticks every 150 ms, as a jittery relay delivers them.
    const { frame } = joined((tick) => Math.floor(tick / 3) * 3 * TICK_MS);
    const ran = frames(180, frame).slice(30);
    expect(Math.max(...ran)).toBe(1);
    expect(sum(ran)).toBeGreaterThanOrEqual(45);
  });

  it('shrinks its reserve on an even link, and grows it on a jittery one', () => {
    const even = joined((tick) => tick * TICK_MS + 30);
    frames(600, even.frame);
    expect(even.game.reserve).toBeLessThan(40);

    // Each tick late by up to 120 ms, in a fixed but uneven pattern.
    const lateBy = (tick: number) => ((tick * 7919) % 13) * 10;
    const rough = joined((tick) => tick * TICK_MS + lateBy(tick));
    const ran = frames(600, rough.frame).slice(300);
    expect(rough.game.reserve).toBeGreaterThan(100);
    // With a reserve that wide, the world runs without a pause.
    expect(Math.max(...ran)).toBe(1);
    expect(sum(ran)).toBeGreaterThanOrEqual(98);
  });

  it('holds when ticks stop coming, the time drawn between ticks with it, and goes on after', () => {
    const { game, frame } = joined((tick) => (tick < 20 ? tick * TICK_MS : tick * TICK_MS + 2000));
    frames(120, frame);
    const held = game.progress;
    expect(sum(frames(30, frame))).toBe(0);
    expect(game.progress).toBe(held);
    // The host's tab woke: ticks come again, and the world goes on without them piling up.
    frames(180, frame);
    const ran = frames(60, frame);
    expect(sum(ran)).toBeGreaterThanOrEqual(18);
  });

  it('drains a backlog within a few seconds, a few ticks a frame', () => {
    // A minute of ticks at once, as after a tab that slept, or a host at four times the speed.
    const { client, frame } = joined((tick) => (tick < 1200 ? 0 : Infinity));
    let count = 1;
    let most = frame();
    expect(client.queued).toBeGreaterThan(1000);
    for (; client.queued > 2 && count < 1000; count++) most = Math.max(most, frame());
    expect(count / 60).toBeLessThan(5);
    expect(most).toBeLessThanOrEqual(5);
  });
});
