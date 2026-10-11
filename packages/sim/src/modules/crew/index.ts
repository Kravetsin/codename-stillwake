import { CREW } from '@stillwake/content';
import { cellsOf } from '../../core/layout';
import { defineModule, withFuzz } from '../../core/module';
import type { AtmosphereModule } from '../atmosphere';
import { fuzzCrew } from './fuzz';

/** A hero, named by the peer that plays it. */
export interface Hero {
  readonly hero: number;
  /** The cell its body is in, as its client last said. */
  cell: number;
  /** The oxygen its suit holds. */
  suit: number;
  /** Ticks left passed out; 0 while conscious. */
  out: number;
}

export interface CrewState {
  /** Where heroes wake, from the map's S; the first cell when it has none. */
  spawn: number;
  /** Ticks run: breaths come every `CREW.breathEvery` of them. */
  clock: number;
  /** Every hero, in id order. */
  heroes: Hero[];
}

const crewModule = defineModule<[AtmosphereModule]>()({
  id: 'crew',
  dependsOn: ['atmosphere'],
  init: (layout): CrewState => ({ spawn: cellsOf(layout, 'S')[0] ?? 0, clock: 0, heroes: [] }),

  queries: {
    spawn: (ctx) => ctx.state.spawn,
    hero: (ctx, id: number) => ctx.state.heroes.find((h) => h.hero === id),
  },

  commands: {
    /**
     * The sender's hero is at `cell`: sent when the hero enters another room as its client sees it,
     * and first of all when it wakes, which brings it in with a full suit.
     */
    enter: {
      apply(ctx, p: { cell: number }) {
        const hero = ctx.state.heroes.find((h) => h.hero === ctx.from);
        if (hero) {
          hero.cell = p.cell;
          return;
        }
        ctx.state.heroes.push({ hero: ctx.from, cell: p.cell, suit: CREW.suit, out: 0 });
        ctx.state.heroes.sort((a, b) => a.hero - b.hero);
      },
    },
  },

  systems: [
    {
      // After atmosphere in the simulation phase, so a breath reads this tick's air.
      phase: 'simulation',
      run(ctx) {
        ctx.state.clock += 1;
        const breath = ctx.state.clock % CREW.breathEvery === 0;
        for (const hero of ctx.state.heroes) {
          if (hero.out > 0) {
            hero.out -= 1;
            if (hero.out === 0) {
              hero.cell = ctx.state.spawn;
              hero.suit = CREW.suit;
            }
            continue;
          }
          if (!breath) continue;
          // One draw for the breath and the refill: what comes beyond the breath tops up the suit.
          const want = 1 + Math.min(CREW.refill, CREW.suit - hero.suit);
          const taken = ctx.deps.atmosphere.op.breathe(hero.cell, want);
          if (taken > 0) {
            hero.suit += taken - 1;
            continue;
          }
          hero.suit -= 1;
          if (hero.suit === 0) hero.out = CREW.passOut;
        }
      },
    },
  ],
});

export type CrewModule = typeof crewModule;
export const crew = withFuzz(crewModule, fuzzCrew);
