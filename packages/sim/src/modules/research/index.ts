import { RESEARCH, SCHEMATICS, UNLOCKS } from '@stillwake/content';
import { defineModule } from '../../core/module';
import type { GridModule, Placement } from '../grid';
import type { Item, ItemsModule } from '../items';
import type { PowerModule } from '../power';
import { BLUEPRINTS, blueprintOf } from './blueprints';

export { BLUEPRINTS, blueprintOf } from './blueprints';

/** An analyzer part-way through what its slot holds, in thousandths of a tick at full power. */
export interface Analysis {
  readonly analyzer: number;
  readonly progress: number;
}

export interface ResearchState {
  /** The blueprints known, by id, sorted. */
  known: string[];
  /** The analyzers at work, by machine id, in id order. */
  analyses: Analysis[];
}

/** Why an analyzer with something in its slot learns nothing, as an i18n key. */
export type ResearchProblem = 'research.unpowered' | 'research.nothingNew';

type Deps = [GridModule, ItemsModule, PowerModule];

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const unlocks: Readonly<Partial<Record<Item, readonly string[]>>> = UNLOCKS;

/**
 * What analysing `item` would teach, given `known`: a schematic the first machine of `SCHEMATICS`
 * not yet known; anything else the blueprints it unlocks but those known; nothing for nothing.
 */
function teaches(known: readonly string[], item: Item | undefined): readonly string[] {
  if (item === undefined) return [];
  if (item === 'schematic') {
    const next = SCHEMATICS.find((id) => !known.includes(id));
    return next === undefined ? [] : [next];
  }
  return (unlocks[item] ?? []).filter((id) => !known.includes(id));
}

const WORK = RESEARCH.ticks * 1000;

const researchModule = defineModule<Deps>()({
  id: 'research',
  dependsOn: ['grid', 'items', 'power'],
  init: (layout): ResearchState => ({
    known: [...(layout.known ?? BLUEPRINTS.map((b) => b.id))].sort(byText),
    analyses: [],
  }),

  queries: {
    /** Whether `placement`'s blueprint is known: every one in creative mode. */
    knows: (ctx, placement: Placement) =>
      ctx.deps.items.query.creative() || ctx.state.known.includes(blueprintOf(placement)),
    /** The blueprints known, by id, sorted: live and read-only. */
    known: (ctx) => ctx.state.known,
    /** Every blueprint there is, with what it places. */
    blueprints: () => BLUEPRINTS,
    /**
     * Analyzer `id` as its panel shows it: with something in its slot, how far it is, out of how
     * much work, and why it stands still if it does; nothing for an empty slot.
     */
    at(ctx, id: number) {
      const item = ctx.deps.items.query.crate(id)[0]?.item;
      if (item === undefined) return undefined;
      const progress = ctx.state.analyses.find((a) => a.analyzer === id)?.progress ?? 0;
      const problem: ResearchProblem | undefined =
        teaches(ctx.state.known, item).length === 0
          ? 'research.nothingNew'
          : ctx.deps.power.query.satisfaction(id) === 0
            ? 'research.unpowered'
            : undefined;
      return { item, progress, work: WORK, problem };
    },
  },

  systems: [
    {
      // After power's derivation: an analyzer works at its satisfaction of this tick.
      phase: 'simulation',
      run(ctx) {
        const { grid, items, power } = ctx.deps;
        const kept: Analysis[] = [];
        for (const m of grid.query.machines()) {
          if (m.kind !== 'analyzer') continue;
          const item = items.query.crate(m.id)[0]?.item;
          const learns = teaches(ctx.state.known, item);
          // An empty slot, or nothing new in it: what was done is dropped.
          if (learns.length === 0) continue;
          const was = ctx.state.analyses.find((a) => a.analyzer === m.id)?.progress ?? 0;
          const progress = was + power.query.satisfaction(m.id);
          if (progress < WORK) {
            kept.push({ analyzer: m.id, progress });
            continue;
          }
          ctx.state.known = [...ctx.state.known, ...learns].sort(byText);
          // A schematic is used up; a material stays to be taken back.
          if (item === 'schematic') items.op.consume(m.id, 0);
        }
        ctx.state.analyses = kept;
      },
    },
  ],
});

export type ResearchModule = typeof researchModule;
export const research = researchModule;
