import { createClient, type ToClient } from '@stillwake/net';
import {
  command,
  debris,
  grid,
  parseLayout,
  stillwake,
  STRUCTURE,
  type Command,
} from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { grabbing, predictedGrid } from './predicted';

/** A guest whose host is not here: the test sends its commands and releases its ticks by hand. */
function guest(map: string) {
  let receive: (message: ToClient) => void = () => {};
  const client = createClient(
    stillwake.create(1, parseLayout(map)),
    { send: () => {}, onMessage: (handler) => (receive = handler) },
    1,
  );
  const door = (cell: number) => command(grid, 'toggleDoor', { cell });
  return {
    client,
    door,
    /** Releases the next tick with these commands, stamped as this guest's, and runs it. */
    run: (...commands: Command[]) => {
      receive({
        kind: 'tick',
        tick: client.sim.world.tick,
        commands: commands.map((c) => ({ ...c, from: 1 })),
      });
      client.update();
    },
  };
}

const MAP = '#D#\n#D#\n...';
const doorway = (structure: readonly number[]) => [1, 4].map((c) => structure[c]);
const OPEN = [STRUCTURE.doorOpen, STRUCTURE.doorOpen];
const SHUT = [STRUCTURE.doorClosed, STRUCTURE.doorClosed];

describe('the grid as this peer shows it', () => {
  it('is the world as it is with nothing in flight', () => {
    const { client } = guest(MAP);
    expect(predictedGrid(client).structure).toBe(client.sim.query(grid).layers().structure);
  });

  it('shows a door toggle at once, the whole doorway, while the world waits for its tick', () => {
    const { client, door } = guest(MAP);
    client.send(door(4));
    expect(doorway(predictedGrid(client).structure)).toEqual(OPEN);
    expect(doorway(client.sim.query(grid).layers().structure)).toEqual(SHUT);
  });

  it('shows two toggles in flight undone, and one the sim would refuse not at all', () => {
    const { client, door } = guest(MAP);
    client.send(door(1));
    client.send(door(4));
    client.send(door(7));
    expect(predictedGrid(client).structure).toEqual(client.sim.query(grid).layers().structure);
  });

  it('shows the same once the tick runs it, with nothing in flight', () => {
    const { client, door, run } = guest(MAP);
    client.send(door(1));
    const before = predictedGrid(client);
    run(door(1));
    expect(client.inFlight).toEqual([]);
    expect(predictedGrid(client).structure).toEqual(before.structure);
    expect(predictedGrid(client).key).not.toBe(before.key);
  });

  it('is made once for the same world and the same toggles', () => {
    const { client, door } = guest(MAP);
    client.send(door(1));
    expect(predictedGrid(client)).toBe(predictedGrid(client));
  });
});

describe('the debris this peer is grabbing', () => {
  it('is each piece with a grab in flight, and none once it has run', () => {
    const { client, run } = guest(MAP);
    const sent = [
      command(debris, 'grab', { piece: 4 }),
      command(grid, 'toggleDoor', { cell: 1 }),
      command(debris, 'grab', { piece: 9 }),
    ];
    for (const c of sent) client.send(c);
    expect([...grabbing(client)]).toEqual([4, 9]);
    run(...sent);
    expect(grabbing(client).size).toBe(0);
  });
});
