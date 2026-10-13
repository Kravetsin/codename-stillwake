import { CABLE_COST, MACHINES, type MachineSpec } from '@stillwake/content';
import { machinesOf, type Layout } from '../../core/layout';
import { defineModule, refuse, withFuzz, type QueryApi } from '../../core/module';
import type { GridModule, Machine } from '../grid';
import type { ItemsModule } from '../items';
import type { RoomsModule } from '../rooms';
import { fuzzPower } from './fuzz';
import {
  byEnds,
  findNetworks,
  inSpan,
  nodeAt,
  ordered,
  type Cable,
  type PowerNetwork,
} from './nodes';

export type { Cable, PowerNetwork } from './nodes';

export interface PowerState {
  /** Every cable, ordered by its ends. */
  cables: Cable[];
  /** Derived: the networks the cables join, in id order. */
  networks: PowerNetwork[];
  /** Derived: each cabled user's satisfaction in thousandths, by machine id. */
  satisfaction: Map<number, number>;
}

type Deps = [GridModule, RoomsModule, ItemsModule];
type Grid = QueryApi<GridModule>;

/**
 * The cables a map lays, each end resolved to its node as `lay` would: a machine drawn there, by its
 * top-left, or the cell. A map whose cable ends on nothing a cable can end on does not load.
 */
function startingCables(layout: Layout): Cable[] {
  const machines = machinesOf(layout);
  const resolve = (cell: number) => {
    const machine = machines.find((m) => m.cells.includes(cell));
    const s: MachineSpec | undefined = machine && MACHINES[machine.kind];
    if (machine && (s?.makes !== undefined || s?.draws !== undefined)) return machine.cell;
    const char = layout.rows[Math.floor(cell / layout.width)]?.[cell % layout.width] ?? ' ';
    // Every character but a space has a back wall to mount on, a machine's included.
    if (machine || char === ' ') throw new Error(`Map cell ${cell}: a cable ends on no node.`);
    return cell;
  };
  return (layout.cables ?? [])
    .map(([a, b]) => ({ ...ordered(resolve(a), resolve(b)), paid: true }))
    .sort(byEnds);
}

/** Why peer `from` cannot lay a cable from `a` to `b`, as a refusal key. */
function layProblem(
  grid: Grid,
  items: QueryApi<ItemsModule>,
  cables: readonly Cable[],
  from: number,
  a: number,
  b: number,
): string | undefined {
  const p = nodeAt(grid, a);
  const q = nodeAt(grid, b);
  if (p === undefined || q === undefined) return 'power.noNode';
  if (p === q) return 'power.sameNode';
  if (!inSpan(grid, p, q)) return 'power.tooLong';
  const ends = ordered(p, q);
  if (cables.some((c) => c.a === ends.a && c.b === ends.b)) return 'power.twice';
  return items.shortOf(from, CABLE_COST);
}

/** Whether a user draws now: a furnace only while it has salvage to smelt and room for what it makes. */
const drawing = (items: QueryApi<ItemsModule>) => (m: Machine) =>
  (MACHINES[m.kind] as MachineSpec).inputs === undefined || items.canSmelt(m.id);

const powerModule = defineModule<Deps>()({
  id: 'power',
  dependsOn: ['grid', 'rooms', 'items'],
  init: (layout): PowerState => ({
    cables: startingCables(layout),
    networks: [],
    satisfaction: new Map(),
  }),

  derived: {
    keys: ['networks', 'satisfaction'],
    rebuild(ctx) {
      Object.assign(
        ctx.state,
        findNetworks(
          ctx.deps.grid.query,
          ctx.deps.rooms.query,
          ctx.state.cables,
          drawing(ctx.deps.items.query),
        ),
      );
    },
  },

  queries: {
    cables: (ctx) => ctx.state.cables,
    networks: (ctx) => ctx.state.networks,
    /** The node a cable laid at `cell` would end on, or nothing: see `nodeAt`. */
    nodeAt: (ctx, cell: number) => nodeAt(ctx.deps.grid.query, cell),
    /** The network node `node` is on, if a cable ends there. */
    networkOf: (ctx, node: number) => ctx.state.networks.find((n) => n.nodes.includes(node)),
    /** Whether a cable ends on node `node`: a machine there is not taken apart. */
    cabled: (ctx, node: number) => ctx.state.cables.some((c) => c.a === node || c.b === node),
    /** The share of its draw machine `id` gets, in thousandths; none off every network. */
    satisfaction: (ctx, id: number) => ctx.state.satisfaction.get(id) ?? 0,
    /** Why peer `peer`'s `lay` from `a` to `b` would be refused: what the cable ghost shows. */
    layProblem: (ctx, peer: number, a: number, b: number) =>
      layProblem(ctx.deps.grid.query, ctx.deps.items.query, ctx.state.cables, peer, a, b),
  },

  commands: {
    lay: {
      validate(ctx, p: { a: number; b: number }) {
        const why = layProblem(
          ctx.deps.grid.query,
          ctx.deps.items.query,
          ctx.state.cables,
          ctx.from,
          p.a,
          p.b,
        );
        if (why) return refuse(why);
      },
      apply(ctx, p: { a: number; b: number }) {
        const grid = ctx.deps.grid.query;
        const ends = ordered(nodeAt(grid, p.a) as number, nodeAt(grid, p.b) as number);
        const taken = ctx.deps.items.op.take(ctx.from, CABLE_COST);
        ctx.state.cables.push({ ...ends, paid: Object.keys(taken).length > 0 });
        ctx.state.cables.sort(byEnds);
      },
    },
    cut: {
      validate(ctx, p: { a: number; b: number }) {
        const ends = ordered(p.a, p.b);
        const cable = ctx.state.cables.find((c) => c.a === ends.a && c.b === ends.b);
        if (!cable) return refuse('power.noCable');
        const why = cable.paid ? ctx.deps.items.query.fullFor(ctx.from, CABLE_COST) : undefined;
        if (why) return refuse(why);
      },
      apply(ctx, p: { a: number; b: number }) {
        const ends = ordered(p.a, p.b);
        const cable = ctx.state.cables.find((c) => c.a === ends.a && c.b === ends.b);
        if (cable?.paid) ctx.deps.items.op.give(ctx.from, CABLE_COST);
        ctx.state.cables = ctx.state.cables.filter((c) => c !== cable);
      },
    },
  },

  systems: [
    {
      // Every tick: a wall built or broken moves a panel in or out of space, a machine comes or goes.
      phase: 'derivation',
      run(ctx) {
        Object.assign(
          ctx.state,
          findNetworks(
            ctx.deps.grid.query,
            ctx.deps.rooms.query,
            ctx.state.cables,
            drawing(ctx.deps.items.query),
          ),
        );
      },
    },
  ],
});

export type PowerModule = typeof powerModule;
export const power = withFuzz(powerModule, fuzzPower);
