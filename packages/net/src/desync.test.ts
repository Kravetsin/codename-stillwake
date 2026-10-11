import {
  atmosphere,
  building,
  command,
  defineModule,
  defineSim,
  hazards,
  parseLayout,
  stillwake,
  stock,
  type Sim,
  wreck,
} from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { fuzzDesync } from './testing/desync';
import { board, drift } from './testing/fixtures';

const SEEDS = [1, 2, 3, 42, 2026];

describe('desync fuzz: the game', () => {
  it.each(SEEDS)('keeps every client in sync on the starting wreck (seed %i)', (seed) => {
    const run = fuzzDesync(stillwake, { seed, layout: wreck });
    expect(run.desync).toBeUndefined();
    expect(run.ticks).toBe(600);
  });

  it('keeps every client in sync past the first meteor on the wreck', () => {
    const first = stillwake.create(5, wreck).query(hazards).meteorIn();
    let seen: Sim | undefined;
    const run = fuzzDesync(stillwake, {
      seed: 5,
      layout: wreck,
      ticks: first + 200,
      tamper: (_tick, clients) => {
        seen = clients[0]?.sim;
      },
    });
    expect(run.desync).toBeUndefined();
    // Past the first meteor, its draws ran: the next is due later than the first was.
    const slice = seen?.world.slices.hazards as { nextHit: number } | undefined;
    expect(seen?.world.tick).toBeGreaterThan(first);
    expect(slice?.nextHit).toBeGreaterThan(first);
  });

  it('keeps every client in sync while air fills, leaks and vents, and heroes breathe it', () => {
    // A room with a vent above a tank and the spawn beside them. The first client pipes them and
    // loads the tank through the pipeline, then the fuzz plays on past two leak beats, breaching
    // walls and moving heroes in and out as it goes.
    const room = parseLayout([
      '.............',
      '.###########.',
      '.#V..S.....#.',
      '.#TT.......#.',
      '.#TT.......#.',
      '.###########.',
      '.............',
    ]);
    const cell = (x: number, y: number) => y * 13 + x;
    const pipe = { layer: 'conduit', kind: 'pipe' } as const;
    const tank = 2;
    let aired = 0;
    let peak = 0;
    let drawn = false;
    let refilled = false;
    let woke = false;
    const suits = new Map<number, { suit: number; out: number }>();
    const run = fuzzDesync(stillwake, {
      seed: 8,
      layout: room,
      // Past two leak beats: an aired room leaks once a minute, 1200 ticks.
      ticks: 2600,
      tamper: (tick, clients) => {
        const first = clients[0];
        if (!first) return;
        if (tick === 0) {
          first.send(command(stock, 'setCreative', { on: true }));
          for (const at of [cell(2, 2), cell(2, 3), cell(2, 4)]) {
            first.send(command(building, 'placePlan', { cell: at, placement: pipe }));
          }
        } else if (tick < 40) {
          for (const plan of [1, 2, 3]) first.send(command(building, 'work', { plan }));
        } else if (tick === 40) {
          for (let i = 0; i < 3; i++) first.send(command(atmosphere, 'loadCanister', { tank }));
        }
        const air = first.sim.world.slices.atmosphere as { aired: number[] };
        aired = Math.max(aired, air.aired.length);
        const oxygen = first.sim.query(atmosphere).oxygenIn(tank);
        if (oxygen < peak) drawn = true;
        peak = Math.max(peak, oxygen);
        const heroes = (
          first.sim.world.slices.crew as {
            heroes: { hero: number; suit: number; out: number }[];
          }
        ).heroes;
        for (const h of heroes) {
          const before = suits.get(h.hero);
          if (before && before.out === 0 && h.out === 0 && h.suit > before.suit) refilled = true;
          if (before && before.out > 0 && h.out === 0) woke = true;
          suits.set(h.hero, { suit: h.suit, out: h.out });
        }
      },
    });
    expect(run.desync).toBeUndefined();
    expect(aired).toBeGreaterThan(0);
    expect(drawn).toBe(true);
    // Breathing ran both ways: a suit refilled from room air, and a hero passed out and woke.
    expect(refilled).toBe(true);
    expect(woke).toBe(true);
  });
});

describe('desync fuzz: the harness itself', () => {
  const fixtures = defineSim([drift, board]);

  it.each(SEEDS)('keeps clients in sync under random commands (seed %i)', (seed) => {
    const run = fuzzDesync(fixtures, { seed });
    expect(run.desync).toBeUndefined();
    expect(run.commands).toBeGreaterThan(500);
    // Refusals go through the same path on every peer, so they are fuzzed too.
    expect(run.refused).toBeGreaterThan(50);
  });

  it('catches a client whose world was changed behind the pipeline’s back', () => {
    const run = fuzzDesync(fixtures, {
      seed: 7,
      tamper: (tick, clients) => {
        if (tick !== 30) return;
        const drifted = clients[2]?.sim.world.slices['drift'] as { position: number };
        drifted.position += 1;
      },
    });
    expect(run.desync?.tick).toBe(40);
    expect(new Set(run.desync?.hashes).size).toBe(2);
  });

  it('refuses a module that has commands but no fuzz generator', () => {
    const silent = defineModule()({
      id: 'silent',
      dependsOn: [],
      init: () => ({ n: 0 }),
      commands: { bump: { apply: (ctx, p: { by: number }) => void (ctx.state.n += p.by) } },
    });
    expect(() => fuzzDesync(defineSim([board, silent]), { seed: 1 })).toThrow(
      "Modules with commands but no fuzz generator: 'silent'. Add one with withFuzz.",
    );
  });

  it('does not ask a module without commands for a generator', () => {
    const quiet = defineModule()({ id: 'quiet', dependsOn: [], init: () => ({}) });
    expect(fuzzDesync(defineSim([board, quiet]), { seed: 1, ticks: 40 }).desync).toBeUndefined();
  });
});
