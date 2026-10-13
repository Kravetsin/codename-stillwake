import { CABLE_COST, MACHINES, type MachineSpec } from '@stillwake/content';
import { machinesOf, type Layout } from '../../core/layout';
import { defineModule, refuse, withFuzz, type QueryApi } from '../../core/module';
import type { GridModule } from '../grid';
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

/** The cables a `move` from node `from` takes: the one named, or every one ending there. */
function moved(cables: readonly Cable[], from: number, cable?: { a: number; b: number }): Cable[] {
  const named = cable && ordered(cable.a, cable.b);
  return cables.filter(
    (c) => (c.a === from || c.b === from) && (!named || (c.a === named.a && c.b === named.b)),
  );
}

/**
 * Why cables cannot move from node `from` to the node at cell `to`, as a refusal key: none ends
 * there, no node is there, one would end where it starts or join a pair already joined, or one would
 * be pulled taut, its ends farther apart than a cable spans.
 */
function moveProblem(
  grid: Grid,
  cables: readonly Cable[],
  from: number,
  to: number,
  cable?: { a: number; b: number },
): string | undefined {
  const taken = moved(cables, from, cable);
  if (taken.length === 0) return 'power.noCable';
  const target = nodeAt(grid, to);
  if (target === undefined) return 'power.noNode';
  const kept = cables.filter((c) => !taken.includes(c));
  const pairs = new Set(kept.map((c) => `${c.a}:${c.b}`));
  for (const c of taken) {
    const other = c.a === from ? c.b : c.a;
    if (other === target) return 'power.sameNode';
    const ends = ordered(other, target);
    if (pairs.has(`${ends.a}:${ends.b}`)) return 'power.twice';
    pairs.add(`${ends.a}:${ends.b}`);
    if (!inSpan(grid, other, target)) return 'power.taut';
  }
  return undefined;
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
        findNetworks(ctx.deps.grid.query, ctx.deps.rooms.query, ctx.state.cables),
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
    /** Why a `move` from node `from` to cell `to` would be refused: what a dragged end shows. */
    moveProblem: (ctx, from: number, to: number, cable?: { a: number; b: number }) =>
      moveProblem(ctx.deps.grid.query, ctx.state.cables, from, to, cable),
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
    move: {
      validate(ctx, p: { from: number; to: number; cable?: { a: number; b: number } }) {
        const why = moveProblem(ctx.deps.grid.query, ctx.state.cables, p.from, p.to, p.cable);
        if (why) return refuse(why);
      },
      apply(ctx, p: { from: number; to: number; cable?: { a: number; b: number } }) {
        const target = nodeAt(ctx.deps.grid.query, p.to) as number;
        const taken = moved(ctx.state.cables, p.from, p.cable);
        ctx.state.cables = ctx.state.cables
          .map((c) => {
            if (!taken.includes(c)) return c;
            const other = c.a === p.from ? c.b : c.a;
            return { ...ordered(other, target), paid: c.paid };
          })
          .sort(byEnds);
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
          findNetworks(ctx.deps.grid.query, ctx.deps.rooms.query, ctx.state.cables),
        );
      },
    },
  ],
});

export type PowerModule = typeof powerModule;
export const power = withFuzz(powerModule, fuzzPower);
