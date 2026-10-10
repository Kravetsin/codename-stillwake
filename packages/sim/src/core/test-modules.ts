// Test-only modules that exercise the core. Real modules live in `src/modules/`.
import { defineModule, event, refuse } from './module';

export const tanks = defineModule()({
  id: 'tanks',
  dependsOn: [],
  events: { emptied: event<{ tank: number }>() },
  init: () => ({ levels: [0, 0] as number[], capacity: 10 }),
  queries: {
    level: (ctx, tank: number) => ctx.state.levels[tank] ?? 0,
    total: (ctx) => ctx.state.levels.reduce((sum, l) => sum + l, 0),
  },
  operations: {
    /** Takes up to `amount` from a tank and says how much it got. */
    draw(ctx, tank: number, amount: number): number {
      const level = ctx.state.levels[tank] ?? 0;
      const got = Math.min(level, amount);
      ctx.state.levels[tank] = level - got;
      if (got > 0 && level - got === 0) ctx.emit('emptied', { tank });
      return got;
    },
  },
  commands: {
    fill: {
      validate(ctx, p: { tank: number; amount: number }) {
        const level = ctx.state.levels[p.tank];
        if (level === undefined) return refuse('tanks.noSuchTank');
        if (!Number.isSafeInteger(p.amount) || p.amount < 1) return refuse('tanks.badAmount');
        if (level + p.amount > ctx.state.capacity) return refuse('tanks.overCapacity');
      },
      apply(ctx, p: { tank: number; amount: number }) {
        ctx.state.levels[p.tank] = (ctx.state.levels[p.tank] ?? 0) + p.amount;
      },
    },
  },
});

export type Tanks = typeof tanks;

export const crew = defineModule<[Tanks]>()({
  id: 'crew',
  dependsOn: ['tanks'],
  events: { gasping: event<{ hero: number }>() },
  init: () => ({ heroes: [] as { tank: number; air: number }[] }),
  queries: {
    air: (ctx, hero: number) => ctx.state.heroes[hero]?.air,
  },
  commands: {
    join: {
      validate(ctx, p: { tank: number }) {
        if (ctx.deps.tanks.query.level(p.tank) === 0) return refuse('crew.noAir');
      },
      apply(ctx, p: { tank: number }) {
        ctx.state.heroes.push({ tank: p.tank, air: 3 });
      },
    },
  },
  systems: [
    {
      phase: 'simulation',
      run(ctx) {
        ctx.state.heroes.forEach((hero, i) => {
          if (ctx.deps.tanks.op.draw(hero.tank, 1) === 1) return;
          hero.air = Math.max(0, hero.air - 1);
          ctx.emit('gasping', { hero: i });
        });
      },
    },
  ],
});

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
