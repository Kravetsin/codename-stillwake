import { canonicalJson, hashText, plainCopy } from './canonical';
import {
  PHASES,
  type AnyModule,
  type CommandImpl,
  type CommandsOf,
  type Ctx,
  type DeepReadonly,
  type Deps,
  type IdOf,
  type QueryApi,
  type ReadCtx,
} from './module';
import { rngOver, seedRng, type RngState } from './rng';

export const TICKS_PER_SECOND = 20;

/** A player's intent, as it travels from the client through the host to every peer. */
export interface Command {
  readonly module: string;
  readonly type: string;
  readonly payload: unknown;
}

export function command<M extends AnyModule, K extends keyof CommandsOf<M> & string>(
  module: M,
  type: K,
  payload: CommandsOf<M>[K],
): Command {
  return { module: module.id, type, payload };
}

export interface SimEvent {
  readonly module: string;
  readonly type: string;
  readonly payload: unknown;
}

export interface Refused {
  readonly command: Command;
  readonly reason: string;
}

export interface TickReport {
  readonly refused: readonly Refused[];
  readonly events: readonly SimEvent[];
}

/** Everything a world is. Plain data: saved, hashed and compared between peers. */
export interface WorldData {
  /** The next tick to run. */
  tick: number;
  rng: RngState;
  slices: Record<string, unknown>;
}

export interface Sim {
  /** Read-only: a world changes only through `step`, and a loaded one gets a sim of its own. */
  readonly world: DeepReadonly<WorldData>;
  /** Applies the commands stamped for the current tick, runs every phase, advances the tick. */
  step(commands: readonly Command[]): TickReport;
  query<M extends AnyModule>(module: M): QueryApi<M>;
  hash(): string;
}

export interface SimDefinition {
  /** Registered modules in run order: every module after the ones it depends on. */
  readonly modules: readonly AnyModule[];
  create(seed: number): Sim;
}

export function defineSim(modules: readonly AnyModule[]): SimDefinition {
  const ordered = orderModules(modules);
  return {
    modules: ordered,
    create(seed) {
      const slices: Record<string, unknown> = {};
      for (const m of ordered) slices[m.id] = m.init();
      return instantiate(ordered, { tick: 0, rng: seedRng(seed), slices });
    },
  };
}

/** Orders modules so each follows its dependencies; registration order breaks ties. */
export function orderModules(modules: readonly AnyModule[]): AnyModule[] {
  const byId = new Map<string, AnyModule>();
  for (const m of modules) {
    if (byId.has(m.id)) throw new Error(`Module '${m.id}' is registered twice.`);
    byId.set(m.id, m);
  }

  const ordered: AnyModule[] = [];
  const done = new Set<string>();
  const path: string[] = [];

  const visit = (m: AnyModule): void => {
    if (done.has(m.id)) return;
    const loopStart = path.indexOf(m.id);
    if (loopStart >= 0) {
      throw new Error(
        `Modules depend on each other: ${[...path.slice(loopStart), m.id].join(' → ')}.`,
      );
    }
    path.push(m.id);
    for (const depId of m.dependsOn) {
      const dep = byId.get(depId);
      if (!dep) throw new Error(`Module '${m.id}' depends on '${depId}', which is not registered.`);
      visit(dep);
    }
    path.pop();
    done.add(m.id);
    ordered.push(m);
  };

  for (const m of modules) visit(m);
  return ordered;
}

// Inside the core every module is handled alike; its own types were checked where it was defined.
type AnyCtx = Ctx<unknown, Deps, Record<string, never>>;
type AnyReadCtx = ReadCtx<unknown, Deps>;
type AnyFn = (ctx: unknown, ...args: unknown[]) => unknown;

interface Api {
  query: Record<string, (...args: unknown[]) => unknown>;
  op: Record<string, (...args: unknown[]) => unknown>;
}

function instantiate(ordered: readonly AnyModule[], world: WorldData): Sim {
  const rng = rngOver(world.rng);
  let events: SimEvent[] = [];

  const apis = new Map<string, Api>();
  const readCtxs = new Map<string, AnyReadCtx>();
  const ctxs = new Map<string, AnyCtx>();

  for (const m of ordered) {
    const id: string = m.id;
    const depIds = m.dependsOn;
    const pick = <T>(f: (api: Api) => T) =>
      Object.fromEntries(depIds.map((d) => [d, f(apis.get(d) as Api)]));

    const readCtx = {
      get state() {
        return world.slices[id];
      },
      deps: pick((api) => ({ query: api.query })),
    } as unknown as AnyReadCtx;

    const ctx = {
      get state() {
        return world.slices[id];
      },
      rng,
      deps: pick((api) => api),
      emit(type: string, payload: unknown) {
        // A copy, so no one holding the event can reach into this module's state.
        events.push({ module: id, type, payload: plainCopy(payload) });
      },
    } as unknown as AnyCtx;

    const bind = (fns: Record<string, AnyFn> | undefined, c: unknown) =>
      Object.fromEntries(
        Object.entries(fns ?? {}).map(([name, fn]) => [
          name,
          (...args: unknown[]) => fn(c, ...args),
        ]),
      );

    apis.set(id, {
      query: bind(m.queries as Record<string, AnyFn> | undefined, readCtx),
      op: bind(m.operations as Record<string, AnyFn> | undefined, ctx),
    });
    readCtxs.set(id, readCtx);
    ctxs.set(id, ctx);
  }

  const byId = new Map(ordered.map((m) => [m.id, m]));

  return {
    world,

    step(commands) {
      events = [];
      const refused: Refused[] = [];

      for (const c of commands) {
        const m = byId.get(c.module);
        const impl = (
          m?.commands as Record<string, CommandImpl<unknown, Deps, never>> | undefined
        )?.[c.type];
        // Peers run the same build, so an unknown command is our bug, not a player's mistake.
        if (!impl) throw new Error(`Unknown command '${c.module}.${c.type}'.`);
        // Peers in one process share the command object; each sim must own what it keeps.
        const payload = plainCopy(c.payload) as never;
        const refusal = impl.validate?.(readCtxs.get(c.module) as AnyReadCtx, payload);
        if (refusal) {
          refused.push({ command: c, reason: refusal.reason });
          continue;
        }
        impl.apply(ctxs.get(c.module) as Ctx<unknown, Deps, never>, payload);
      }

      for (const phase of PHASES) {
        for (const m of ordered) {
          for (const system of m.systems ?? []) {
            if (system.phase === phase)
              (system.run as (ctx: AnyCtx) => void)(ctxs.get(m.id) as AnyCtx);
          }
        }
      }

      world.tick += 1;
      return { refused, events };
    },

    query<M extends AnyModule>(module: M) {
      const id: IdOf<M> = module.id;
      if (byId.get(id) !== module) throw new Error(`Module '${id}' is not registered in this sim.`);
      return (apis.get(id) as Api).query as QueryApi<M>;
    },

    hash() {
      return hashText(canonicalJson(world));
    },
  };
}
