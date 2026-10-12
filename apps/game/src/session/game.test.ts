import { createClient, type ToClient } from '@stillwake/net';
import { defineSim } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { PLAYOUT_TICKS } from './playout';

const FRAME_MS = 1000 / 60;
const empty = defineSim([]);
const platform = {
  saves: { read: () => Promise.resolve(undefined), write: () => Promise.resolve() },
};

/** A game joined to a host that is not here: the test releases its ticks by hand. */
function joined() {
  let receive: (message: ToClient) => void = () => {};
  const client = createClient(
    empty.create(1),
    { send: () => {}, onMessage: (handler) => (receive = handler) },
    1,
  );
  const game = createGame(empty, platform, { client });
  let released = 0;
  return {
    game,
    client,
    release: (count: number) => {
      for (let n = 0; n < count; n++) receive({ kind: 'tick', tick: released++, commands: [] });
    },
    /** Runs a frame, and says how many ticks it ran. */
    frame: () => {
      const before = client.sim.world.tick;
      game.frame(FRAME_MS);
      return client.sim.world.tick - before;
    },
  };
}

describe('a joined game', () => {
  it('waits for its reserve before it runs a tick', () => {
    const { release, frame } = joined();
    release(PLAYOUT_TICKS - 1);
    for (let n = 0; n < 30; n++) expect(frame()).toBe(0);
    release(1);
    const ran = Array.from({ length: 30 }, frame).reduce((a, b) => a + b, 0);
    expect(ran).toBeGreaterThan(0);
  });

  it('runs ticks that come in bursts one at a time, as the host released them', () => {
    const { release, frame } = joined();
    const perFrame: number[] = [];
    // Three seconds: a burst of three ticks every 150 ms, as a jittery relay delivers them.
    for (let f = 0; f < 180; f++) {
      if (f % 9 === 0) release(3);
      perFrame.push(frame());
    }
    expect(Math.max(...perFrame)).toBe(1);
    const ran = perFrame.reduce((a, b) => a + b, 0);
    expect(ran).toBeGreaterThanOrEqual(55);
  });

  it('holds when its queue runs dry, and the time drawn between ticks holds with it', () => {
    const { game, release, frame } = joined();
    release(PLAYOUT_TICKS);
    while (frame() === 0);
    for (let f = 0; f < 30; f++) frame();
    const held = game.progress;
    for (let f = 0; f < 10; f++) expect(frame()).toBe(0);
    expect(game.progress).toBe(held);
  });

  it('drains a backlog within a few seconds, a few ticks a frame', () => {
    const { client, release, frame } = joined();
    // A minute of ticks, as after a tab that slept, or a host at four times the speed.
    release(1200);
    let frames = 0;
    let most = 0;
    for (; client.queued > PLAYOUT_TICKS + 1 && frames < 1000; frames++)
      most = Math.max(most, frame());
    expect(frames / 60).toBeLessThan(5);
    expect(most).toBeLessThanOrEqual(5);
  });
});
