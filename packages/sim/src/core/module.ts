import type { Rng } from './rng';

/** Systems run in these phases, in this order, after the tick's commands are applied. */
export type Phase = 'construction' | 'derivation' | 'simulation' | 'events';
export const PHASES: readonly Phase[] = ['construction', 'derivation', 'simulation', 'events'];

/** What `validate` returns to turn a command down; `reason` is an i18n key the player reads. */
export interface Refusal {
  readonly reason: string;
}

export const refuse = (reason: string): Refusal => ({ reason });

declare const PAYLOAD: unique symbol;

/** Declares an event's payload type in a module's `events`. */
export interface EventType<P> {
  readonly [PAYLOAD]?: P;
}

export const event = <P>(): EventType<P> => ({});

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

// Module types vary in every parameter; `any` is the only top type they are all assignable to.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModule = Module<string, any, any, any, any, any, any>;

export type Deps = readonly AnyModule[];

type None = Record<never, never>;

type PayloadOf<T> = T extends EventType<infer P> ? P : never;

/** A function as its callers see it: the context parameter is supplied by the core. */
type Bound<F> = F extends (ctx: never, ...args: infer A) => infer R ? (...args: A) => R : never;

type Parts<M> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- state and deps are not read here
  M extends Module<infer Id, any, any, infer Q, infer O, infer C, any>
    ? { id: Id; queries: Q; operations: O; commands: C }
    : never;

export type IdOf<M> = Parts<M>['id'];

export type QueryApi<M> = {
  readonly [K in keyof Parts<M>['queries']]: Bound<Parts<M>['queries'][K]>;
};

export type OperationApi<M> = {
  readonly [K in keyof Parts<M>['operations']]: Bound<Parts<M>['operations'][K]>;
};

export type CommandsOf<M> = {
  readonly [K in keyof Parts<M>['commands']]: Parts<M>['commands'][K] extends {
    apply: (ctx: never, payload: infer P) => void;
  }
    ? P
    : never;
};

/** What a module sees of a dependency while reading. */
export type ReadDeps<D extends Deps> = {
  readonly [M in D[number] as IdOf<M>]: { readonly query: QueryApi<M> };
};

/** What a module sees of a dependency while changing the world. */
export type FullDeps<D extends Deps> = {
  readonly [M in D[number] as IdOf<M>]: {
    readonly query: QueryApi<M>;
    readonly op: OperationApi<M>;
  };
};

/** Context for queries and `validate`: the module's own state, read-only. */
export interface ReadCtx<S, D extends Deps> {
  readonly state: DeepReadonly<S>;
  readonly deps: ReadDeps<D>;
}

/** Context for `apply`, operations and systems: the module's own state, writable. */
export interface Ctx<S, D extends Deps, E> {
  readonly state: S;
  readonly rng: Rng;
  readonly deps: FullDeps<D>;
  emit<K extends keyof E & string>(type: K, payload: PayloadOf<E[K]>): void;
}

export type QueryImpl<S, D extends Deps> = (ctx: ReadCtx<S, D>, ...args: never[]) => unknown;
export type OperationImpl<S, D extends Deps, E> = (ctx: Ctx<S, D, E>, ...args: never[]) => unknown;

export interface CommandImpl<S, D extends Deps, E> {
  /** Runs when the command applies, on its stamped tick; return a refusal to turn it down. */
  readonly validate?: (ctx: ReadCtx<S, D>, payload: never) => Refusal | undefined | void;
  readonly apply: (ctx: Ctx<S, D, E>, payload: never) => void;
}

export interface SystemImpl<S, D extends Deps, E> {
  readonly phase: Phase;
  readonly run: (ctx: Ctx<S, D, E>) => void;
}

type DepIds<D extends Deps> = { readonly [K in keyof D]: IdOf<D[K]> };

export interface Module<Id extends string, S, D extends Deps, Q, O, C, E> {
  readonly id: Id;
  /** Must list exactly the modules given to `defineModule<[...]>()`, in the same order. */
  readonly dependsOn: DepIds<D>;
  readonly init: () => S;
  readonly events?: E;
  readonly queries?: Q;
  readonly operations?: O;
  readonly commands?: C;
  readonly systems?: readonly SystemImpl<S, D, E>[];
}

/**
 * Defines a sim module. Dependencies are named as types, so a module never imports another's code:
 * `defineModule<[GridModule]>()({ id: 'rooms', dependsOn: ['grid'], ... })`.
 */
export function defineModule<D extends Deps = []>() {
  return <
    const Id extends string,
    S,
    E extends Record<string, EventType<unknown>> = None,
    Q extends Record<string, QueryImpl<S, D>> = None,
    O extends Record<string, OperationImpl<S, D, E>> = None,
    C extends Record<string, CommandImpl<S, D, E>> = None,
  >(def: {
    readonly id: Id;
    readonly dependsOn: DepIds<D>;
    readonly init: () => S;
    readonly events?: E;
    // Intersecting with the constraint is what gives `ctx` its type: a defaulted type parameter
    // alone is not used for contextual typing.
    readonly queries?: Q & Record<string, QueryImpl<S, D>>;
    readonly operations?: O & Record<string, OperationImpl<S, D, E>>;
    readonly commands?: C & Record<string, CommandImpl<S, D, E>>;
    readonly systems?: readonly SystemImpl<S, D, E>[];
  }): Module<Id, S, D, Q, O, C, E> => def;
}
