import type { Sim } from '@stillwake/sim';
import { loopback } from './channel';
import { createClient, type Client } from './client';
import { createHost, type Host } from './host';
import type { ToClient, ToHost } from './protocol';

/** Single-player: a host and one client in the same process, joined by a loopback. */
export function localSession(sim: Sim): { host: Host; client: Client } {
  const host = createHost(sim.world.tick);
  const [toClient, toHost] = loopback<ToClient, ToHost>();
  const id = host.connect(toClient);
  return { host, client: createClient(sim, toHost, id) };
}
