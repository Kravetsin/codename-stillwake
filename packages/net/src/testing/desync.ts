import { createRng, type AnyModule, type Layout, type SimDefinition } from '@stillwake/sim';
import { loopback } from '../channel';
import { createClient, type Client } from '../client';
import { createHost } from '../host';
import type { ToClient, ToHost } from '../protocol';

export interface DesyncOptions {
  readonly seed: number;
  readonly ticks?: number;
  readonly clients?: number;
  readonly checkEvery?: number;
  /** The map every client's world starts from; empty when there is none. */
  readonly layout?: Layout;
  /** Runs after every tick; tests use it to break a client on purpose. */
  readonly tamper?: (tick: number, clients: readonly Client[]) => void;
}

export interface DesyncRun {
  readonly ticks: number;
  readonly commands: number;
  readonly refused: number;
  /** The first check at which the clients' hashes differed, if any. */
  readonly desync?: { readonly tick: number; readonly hashes: readonly string[] };
}

/**
 * The desync fuzz test: a host and its clients in one process, random commands from every module's
 * fuzz generator sent by random clients, clients updating out of step as over a real network, and
 * their state hashes compared at every check.
 */
export function fuzzDesync(definition: SimDefinition, options: DesyncOptions): DesyncRun {
  const { seed, ticks = 600, clients: count = 3, checkEvery = 20, tamper, layout } = options;

  const unfuzzed = definition.modules.filter(hasCommands).filter((m) => !m.fuzz);
  if (unfuzzed.length > 0) {
    const ids = unfuzzed.map((m) => `'${m.id}'`).join(', ');
    throw new Error(`Modules with commands but no fuzz generator: ${ids}. Add one with withFuzz.`);
  }

  const host = createHost(0);
  const clients = Array.from({ length: count }, () => {
    const [toClient, toHost] = loopback<ToClient, ToHost>();
    const id = host.connect(toClient);
    return createClient(definition.create(seed, layout), toHost, id);
  });
  const fuzzable = definition.modules.filter((m) => m.fuzz);
  const rng = createRng(seed ^ 0x5eed);
  let commands = 0;
  let refused = 0;

  // Refusals are counted on the first client only; every client sees the same ones.
  const update = (client: Client) => {
    const reports = client.update();
    if (client === clients[0]) for (const r of reports) refused += r.refused.length;
  };
  const check = () => {
    for (const client of clients) update(client);
    const hashes = clients.map((client) => client.sim.hash());
    return new Set(hashes).size === 1
      ? undefined
      : { tick: (clients[0] as Client).sim.world.tick, hashes };
  };

  for (let tick = 0; tick < ticks; tick++) {
    for (let n = fuzzable.length > 0 ? rng.below(4) : 0; n > 0; n--) {
      const sender = clients[rng.below(count)] as Client;
      const m = fuzzable[rng.below(fuzzable.length)] as AnyModule;
      const pick = (m.fuzz as Fuzz)(sender.sim.world.slices[m.id], rng);
      if (!pick) continue;
      sender.send({ module: m.id, type: pick.type, payload: pick.payload, from: 0 });
      commands += 1;
    }
    host.advance();
    for (const client of clients) if (rng.below(3) !== 0) update(client);
    tamper?.(tick, clients);

    if ((tick + 1) % checkEvery === 0) {
      const desync = check();
      if (desync) return { ticks: tick + 1, commands, refused, desync };
    }
  }
  const desync = check();
  return desync ? { ticks, commands, refused, desync } : { ticks, commands, refused };
}

type Fuzz = (
  state: unknown,
  rng: ReturnType<typeof createRng>,
) => { type: string; payload: unknown } | undefined;

function hasCommands(m: AnyModule): boolean {
  return Object.keys((m.commands ?? {}) as object).length > 0;
}
