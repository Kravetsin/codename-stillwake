import type { Sim } from '@stillwake/sim';
import { loopback } from './channel';
import { createClient, type Client } from './client';
import { createHost, type Host } from './host';
import type { ToClient, ToHost } from './protocol';

/**
 * A host and its player's client in the same process, joined by a loopback: single-player, and the
 * hosting side of co-op. A peer joining later is welcomed with this client's world, brought up to
 * the host's tick first, so `build` must name the build that runs it.
 */
export function localSession(sim: Sim, build = ''): { host: Host; client: Client } {
  const host = createHost(sim.world.tick, {
    build,
    save() {
      client.update();
      // Our bug if it is not: a joiner or a resynced peer would start on another tick.
      if (client.sim.world.tick !== host.tick) {
        throw new Error(`Saving tick ${client.sim.world.tick} for a host on tick ${host.tick}.`);
      }
      return client.sim.save();
    },
  });
  const [toClient, toHost] = loopback<ToClient, ToHost>();
  const id = host.connect(toClient);
  const client = createClient(sim, toHost, id);
  return { host, client };
}
