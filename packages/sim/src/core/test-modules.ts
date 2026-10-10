// Test-only modules that exercise the core. Real modules live in `src/modules/`.
import { cellsOf, parseLayout } from './layout';
import { defineModule, event, refuse, withFuzz } from './module';

const tanksModule = defineModule()({
  id: 'tanks',
  dependsOn: [],
  events: { emptied: event<{ cell: number }>() },
  // One tank per 'T' on the map; `levels[i]` belongs to the tank at `cells[i]`.
  init: (layout) => {
    const cells = cellsOf(layout, 'T');
    return { cells, levels: cells.map(() => 0), capacity: 10 };
  },
  queries: {
    level: (ctx, cell: number) => ctx.state.levels[ctx.state.cells.indexOf(cell)] ?? 0,
    total: (ctx) => ctx.state.levels.reduce((sum, l) => sum + l, 0),
  },
  operations: {
    /** Takes up to `amount` from the tank at `cell` and says how much it got. */
    draw(ctx, cell: number, amount: number): number {
      const i = ctx.state.cells.indexOf(cell);
      const level = ctx.state.levels[i] ?? 0;
      const got = Math.min(level, amount);
      if (got === 0) return 0;
      ctx.state.levels[i] = level - got;
      if (level - got === 0) ctx.emit('emptied', { cell });
      return got;
    },
  },
  commands: {
    fill: {
      validate(ctx, p: { cell: number; amount: number }) {
        const level = ctx.state.levels[ctx.state.cells.indexOf(p.cell)];
        if (level === undefined) return refuse('tanks.noSuchTank');
        if (!Number.isSafeInteger(p.amount) || p.amount < 1) return refuse('tanks.badAmount');
        if (level + p.amount > ctx.state.capacity) return refuse('tanks.overCapacity');
      },
      apply(ctx, p: { cell: number; amount: number }) {
        const i = ctx.state.cells.indexOf(p.cell);
        ctx.state.levels[i] = (ctx.state.levels[i] ?? 0) + p.amount;
      },
    },
  },
});

// A cell with no tank and an amount of 0 come up often enough to fuzz the refusals too.
export const tanks = withFuzz(tanksModule, (state, rng) => ({
  type: 'fill',
  payload: { cell: state.cells[rng.below(state.cells.length + 1)] ?? -1, amount: rng.below(6) },
}));

export type Tanks = typeof tanks;

const crewModule = defineModule<[Tanks]>()({
  id: 'crew',
  dependsOn: ['tanks'],
  events: { gasping: event<{ hero: number }>() },
  init: () => ({ heroes: [] as { cell: number; air: number }[] }),
  queries: {
    air: (ctx, hero: number) => ctx.state.heroes[hero]?.air,
  },
  commands: {
    join: {
      validate(ctx, p: { cell: number }) {
        if (ctx.deps.tanks.query.level(p.cell) === 0) return refuse('crew.noAir');
      },
      apply(ctx, p: { cell: number }) {
        ctx.state.heroes.push({ cell: p.cell, air: 3 });
      },
    },
  },
  systems: [
    {
      phase: 'simulation',
      run(ctx) {
        ctx.state.heroes.forEach((hero, i) => {
          if (ctx.deps.tanks.op.draw(hero.cell, 1) === 1) return;
          hero.air = Math.max(0, hero.air - 1);
          ctx.emit('gasping', { hero: i });
        });
      },
    },
  ],
});

export const crew = withFuzz(crewModule, (_state, rng) => ({
  type: 'join',
  payload: { cell: rng.below(3) },
}));

/** The map most core tests run on: two tanks, at cells 0 and 1. */
export const TWO_TANKS = parseLayout('TT');

// Systems are listed out of phase order on purpose: the core, not the list, decides the order.

/** Records the last phase it ran in. */
export const first = defineModule()({
  id: 'first',
  dependsOn: [],
  init: () => ({ seen: '' }),
  queries: { seen: (ctx) => ctx.state.seen },
  systems: [
    { phase: 'events', run: (ctx) => void (ctx.state.seen = 'events') },
    { phase: 'construction', run: (ctx) => void (ctx.state.seen = 'construction') },
    { phase: 'simulation', run: (ctx) => void (ctx.state.seen = 'simulation') },
    { phase: 'derivation', run: (ctx) => void (ctx.state.seen = 'derivation') },
  ],
});

/** Logs every phase it runs in next to what `first` had seen by then. */
export const second = defineModule<[typeof first]>()({
  id: 'second',
  dependsOn: ['first'],
  init: () => ({ log: [] as string[] }),
  systems: [
    {
      phase: 'simulation',
      run: (ctx) => void ctx.state.log.push(`simulation:${ctx.deps.first.query.seen()}`),
    },
    {
      phase: 'events',
      run: (ctx) => void ctx.state.log.push(`events:${ctx.deps.first.query.seen()}`),
    },
    {
      phase: 'derivation',
      run: (ctx) => void ctx.state.log.push(`derivation:${ctx.deps.first.query.seen()}`),
    },
    {
      phase: 'construction',
      run: (ctx) => void ctx.state.log.push(`construction:${ctx.deps.first.query.seen()}`),
    },
  ],
});

/** Draws from the world PRNG every tick. */
export const dice = defineModule()({
  id: 'dice',
  dependsOn: [],
  init: () => ({ rolls: [] as number[] }),
  systems: [
    {
      phase: 'simulation',
      run(ctx) {
        ctx.state.rolls.push(ctx.rng.below(6) + 1);
      },
    },
  ],
});

/** Keeps a `Map` index next to its entries: derived, so out of saves and rebuilt on load. */
const ledgerModule = defineModule()({
  id: 'ledger',
  dependsOn: [],
  init: () => ({ entries: [] as number[], counts: new Map<number, number>() }),
  derived: {
    keys: ['counts'],
    rebuild(ctx) {
      ctx.state.counts = new Map();
      for (const e of ctx.state.entries)
        ctx.state.counts.set(e, (ctx.state.counts.get(e) ?? 0) + 1);
    },
  },
  queries: { count: (ctx, value: number) => ctx.state.counts.get(value) ?? 0 },
  commands: {
    add: {
      validate(ctx, p: { value: number }) {
        if (!Number.isSafeInteger(p.value)) return refuse('ledger.badValue');
      },
      apply(ctx, p: { value: number }) {
        ctx.state.entries.push(p.value);
        ctx.state.counts.set(p.value, (ctx.state.counts.get(p.value) ?? 0) + 1);
      },
    },
  },
});

export const ledger = withFuzz(ledgerModule, (_state, rng) => ({
  type: 'add',
  payload: { value: rng.below(5) },
}));
