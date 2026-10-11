import { canonicalJson, hashText, plainCopy } from './canonical';
import {
  PHASES,
  type AnyModule,
  type CommandImpl,
  type CommandsOf,
  type CommandCtx,
  type Ctx,
  type DeepReadonly,
  type Deps,
  type IdOf,
  type QueryApi,
  type ReadCtx,
  type ValidateCtx,
} from './module';
import { EMPTY_LAYOUT, type Layout } from './layout';
import { rngOver, seedRng, type RngState } from './rng';

export const TICKS_PER_SECOND = 20;

/** Bumped whenever saved data changes shape; a save of another format is refused. */
export const SAVE_FORMAT = 13;

/**
 * A player's intent, as it travels from the client through the host to every peer. `from` is the
 * peer that sent it, stamped by the host over whatever the client put there: a peer has one hero.
 */
export interface Command {
  readonly module: string;
  readonly type: string;
  readonly payload: unknown;
  readonly from: number;
}

/** A command as `from` would send it; a client leaves it 0 and the host stamps the real one. */
export function command<M extends AnyModule, K extends keyof CommandsOf<M> & string>(
  module: M,
  type: K,
  payload: CommandsOf<M>[K],
  from = 0,
): Command {
  return { module: module.id, type, payload, from };
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
  /** A hash of what a save holds, compared between peers to catch a desync. */
  hash(): string;
  /** Canonical JSON: the same world always gives the same text. */
  save(): string;
}

export interface SimDefinition {
  /** Registered modules in run order: every module after the ones it depends on. */
  readonly modules: readonly AnyModule[];
  /** A new world; every module builds its slice from `layout`, empty when there is no map. */
  create(seed: number, layout?: Layout): Sim;
  /** Restores a world from `Sim.save()`, rebuilding every module's derived state. */
  load(text: string): Sim;
}

export function defineSim(modules: readonly AnyModule[]): SimDefinition {
  const ordered = orderModules(modules);
  return {
    modules: ordered,
    create(seed, layout = EMPTY_LAYOUT) {
      const slices: Record<string, unknown> = {};
      for (const m of ordered) slices[m.id] = m.init(layout);
      return instantiate(ordered, { tick: 0, rng: seedRng(seed), slices });
    },
    load(text) {
      return instantiate(ordered, readSave(ordered, text));
    },
  };
}

interface SaveFile {
  format: number;
  world: WorldData;
}

/** The world as saved and hashed: every slice without its derived keys. */
function savedForm(ordered: readonly AnyModule[], world: WorldData): WorldData {
  const slices: Record<string, unknown> = {};
  for (const m of ordered) {
    const slice = world.slices[m.id];
    const derived = new Set<string>(m.derived?.keys ?? []);
    slices[m.id] =
      derived.size === 0
        ? slice
        : Object.fromEntries(Object.entries(slice as object).filter(([k]) => !derived.has(k)));
  }
  return { tick: world.tick, rng: world.rng, slices };
}

function readSave(ordered: readonly AnyModule[], text: string): WorldData {
  const file = JSON.parse(text) as Partial<SaveFile>;
  if (file.format !== SAVE_FORMAT) {
    throw new Error(
      `A save of format ${String(file.format)} cannot be loaded by format ${SAVE_FORMAT}.`,
    );
  }
  const world = file.world;
  if (!world || !Number.isSafeInteger(world.tick) || !Number.isSafeInteger(world.rng?.s)) {
    throw new Error('The save holds no valid world.');
  }

  const saved = Object.keys(world.slices ?? {});
  const known = ordered.map((m) => m.id);
  const extra = saved.filter((id) => !known.includes(id));
  const missing = known.filter((id) => !saved.includes(id));
  if (extra.length > 0 || missing.length > 0) {
    // Accepted for now: saves are not migrated, so a save from another set of modules is refused.
    throw new Error(
      `The save does not fit these modules (extra: ${extra.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}).`,
    );
  }

  const slices: Record<string, unknown> = {};
  for (const m of ordered) {
    const slice = world.slices[m.id];
    if (!m.derived) {
      slices[m.id] = slice;
      continue;
    }
    // Derived keys start from `init` and are rebuilt once every slice is in place.
    const fresh = m.init(EMPTY_LAYOUT) as Record<string, unknown>;
    const restored = { ...(slice as Record<string, unknown>) };
    for (const k of m.derived.keys) restored[k] = fresh[k];
    slices[m.id] = restored;
  }
  return { tick: world.tick, rng: world.rng, slices };
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

  // In dependency order, so a rebuild can query what its dependencies rebuilt.
  for (const m of ordered) {
    if (!m.derived) continue;
    const rebuildCtx = {
      get state() {
        return world.slices[m.id];
      },
      deps: (readCtxs.get(m.id) as AnyReadCtx).deps,
    };
    (m.derived.rebuild as (ctx: unknown) => void)(rebuildCtx);
  }

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
        // Contexts of its own over the module's, so only this command sees who sent it.
        const sent = { from: c.from };
        const readCtx = Object.assign(
          Object.create(readCtxs.get(c.module) as object) as object,
          sent,
        ) as ValidateCtx<unknown, Deps>;
        const refusal = impl.validate?.(readCtx, payload);
        if (refusal) {
          refused.push({ command: c, reason: refusal.reason });
          continue;
        }
        const ctx = Object.assign(Object.create(ctxs.get(c.module) as object) as object, sent);
        impl.apply(ctx as CommandCtx<unknown, Deps, never>, payload);
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
      return hashText(canonicalJson(savedForm(ordered, world)));
    },

    save() {
      const file: SaveFile = { format: SAVE_FORMAT, world: savedForm(ordered, world) };
      return canonicalJson(file);
    },
  };
}
