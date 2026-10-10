import { cellsOf, parseLayout, type Layout } from '../core/layout';
import type { AnyModule, CommandsOf, QueryApi } from '../core/module';
import { command, type Command, type Sim, type SimDefinition, type SimEvent } from '../core/sim';

/**
 * A game situation for a test: a world drawn as ASCII, commands, ticks, and reads through
 * queries. Every call returns the scenario, so a test reads top to bottom like the situation.
 */
export interface Scenario {
  readonly sim: Sim;
  readonly layout: Layout;
  /** Every refusal reason so far, in order. */
  readonly refusals: readonly string[];
  /** Every event so far, in order. */
  readonly events: readonly SimEvent[];
  /** Queues a command for the next tick `run` plays. */
  do<M extends AnyModule, K extends keyof CommandsOf<M> & string>(
    module: M,
    type: K,
    payload: CommandsOf<M>[K],
  ): Scenario;
  /** Plays `ticks` ticks; queued commands apply on the first. */
  run(ticks?: number): Scenario;
  query<M extends AnyModule>(module: M): QueryApi<M>;
  /** The one cell drawn with `char`; throws when there is none or more than one. */
  cell(char: string): number;
  /** Every cell drawn with `char`, in reading order. */
  cells(char: string): number[];
}

export function scenario(definition: SimDefinition, map = '', seed = 1): Scenario {
  const layout = parseLayout(map);
  const sim = definition.create(seed, layout);
  let queued: Command[] = [];
  const refusals: string[] = [];
  const events: SimEvent[] = [];

  const self: Scenario = {
    sim,
    layout,
    refusals,
    events,
    do(module, type, payload) {
      queued.push(command(module, type, payload));
      return self;
    },
    run(ticks = 1) {
      for (let i = 0; i < ticks; i++) {
        const report = sim.step(queued);
        queued = [];
        refusals.push(...report.refused.map((r) => r.reason));
        events.push(...report.events);
      }
      return self;
    },
    query: (module) => sim.query(module),
    cell(char) {
      const found = cellsOf(layout, char);
      if (found.length !== 1) {
        throw new Error(`The map has ${found.length} cells drawn with '${char}', not one.`);
      }
      return found[0] as number;
    },
    cells: (char) => cellsOf(layout, char),
  };
  return self;
}
