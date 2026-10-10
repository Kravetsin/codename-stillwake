// Modules that exist only for net's tests: real modules live in the sim.
import { defineModule, refuse, withFuzz } from '@stillwake/sim';

const TEXTS = ['', 'hello', 'air low', 'dock'];

/** A shared log: the order of its entries shows the order commands applied in. */
const boardModule = defineModule()({
  id: 'board',
  dependsOn: [],
  init: () => ({ notes: [] as { tick: number; text: string }[], ticks: 0 }),
  queries: {
    notes: (ctx) => ctx.state.notes.map((n) => `${n.tick}:${n.text}`),
    count: (ctx) => ctx.state.notes.length,
  },
  commands: {
    write: {
      validate(_ctx, p: { text: string }) {
        if (p.text === '') return refuse('board.empty');
      },
      apply(ctx, p: { text: string }) {
        ctx.state.notes.push({ tick: ctx.state.ticks, text: p.text });
      },
    },
  },
  systems: [{ phase: 'simulation', run: (ctx) => void (ctx.state.ticks += 1) }],
});

export const board = withFuzz(boardModule, (_state, rng) => ({
  type: 'write',
  payload: { text: TEXTS[rng.below(TEXTS.length)] ?? '' },
}));

/** Drifts by the world's random draws and reacts to the board, so both feed the hash. */
const driftModule = defineModule<[typeof board]>()({
  id: 'drift',
  dependsOn: ['board'],
  init: () => ({ position: 0, pushes: 0 }),
  commands: {
    push: {
      validate(_ctx, p: { by: number }) {
        if (!Number.isSafeInteger(p.by) || p.by < 1 || p.by > 3) return refuse('drift.badPush');
      },
      apply(ctx, p: { by: number }) {
        ctx.state.pushes += p.by;
      },
    },
  },
  systems: [
    {
      phase: 'simulation',
      run(ctx) {
        ctx.state.position += ctx.rng.below(3) - 1 + ctx.state.pushes;
        ctx.state.pushes = ctx.deps.board.query.count() % 2;
      },
    },
  ],
});

export const drift = withFuzz(driftModule, (_state, rng) => ({
  type: 'push',
  payload: { by: rng.below(5) },
}));
