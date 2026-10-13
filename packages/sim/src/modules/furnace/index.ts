import { ITEMS, type ItemSpec } from '@stillwake/content';
import { defineModule } from '../../core/module';
import type { AtmosphereModule } from '../atmosphere';
import type { GridModule } from '../grid';
import type { Item, ItemsModule } from '../items';
import type { PowerModule } from '../power';

/** A furnace at work on one item of its input, paid for in oxygen as it began. */
export interface Smelting {
  readonly furnace: number;
  readonly item: Item;
  /** Work done on it, in thousandths of a tick at full power: `smeltTicks × 1000` finishes it. */
  readonly progress: number;
}

export interface FurnaceState {
  /** The furnaces at work, by machine id, in id order. */
  smelting: Smelting[];
}

/** Why a furnace with salvage in its input is not at work, as an i18n key. */
export type FurnaceProblem = 'furnace.full' | 'furnace.unpowered' | 'furnace.noOxygen';

type Deps = [GridModule, ItemsModule, PowerModule, AtmosphereModule];

/** How long an item smelts and what oxygen it takes, if it is salvage that smelts at all. */
function recipe(item: Item | undefined) {
  const spec: ItemSpec | undefined = item === undefined ? undefined : ITEMS[item];
  return spec?.smeltTicks === undefined || spec.oxygen === undefined
    ? undefined
    : { work: spec.smeltTicks * 1000, oxygen: spec.oxygen };
}

const furnaceModule = defineModule<Deps>()({
  id: 'furnace',
  dependsOn: ['grid', 'items', 'power', 'atmosphere'],
  init: (): FurnaceState => ({ smelting: [] }),

  queries: {
    /**
     * Furnace `id` as its panel shows it: what it smelts, how far, out of how much work, and why it
     * stands still if it does; nothing smelting for an empty or unsmeltable input.
     */
    at(ctx, id: number) {
      const { items, power, atmosphere } = ctx.deps;
      const input = items.query.crate(id)[0]?.item;
      const r = recipe(input);
      if (!r || input === undefined) return undefined;
      const at = ctx.state.smelting.find((s) => s.furnace === id && s.item === input);
      const problem: FurnaceProblem | undefined = !items.query.canSmelt(id)
        ? 'furnace.full'
        : power.query.satisfaction(id) === 0
          ? 'furnace.unpowered'
          : !at && atmosphere.query.oxygenFor(id) < r.oxygen
            ? 'furnace.noOxygen'
            : undefined;
      return { item: input, progress: at?.progress ?? 0, work: r.work, problem };
    },
  },

  systems: [
    {
      // After atmosphere's: a unit a generator made this tick may pay for the next item.
      phase: 'simulation',
      run(ctx) {
        const { grid, items, power, atmosphere } = ctx.deps;
        const kept: Smelting[] = [];
        for (const m of grid.query.machines()) {
          if (m.kind !== 'furnace') continue;
          const input = items.query.crate(m.id)[0]?.item;
          const r = recipe(input);
          if (!r || input === undefined) continue;
          const share = power.query.satisfaction(m.id);
          let at = ctx.state.smelting.find((s) => s.furnace === m.id && s.item === input);
          if (!at) {
            // An item begins only when it can: power, room for its yields, and all its oxygen.
            const ready =
              share > 0 &&
              items.query.canSmelt(m.id) &&
              atmosphere.query.oxygenFor(m.id) >= r.oxygen;
            if (!ready) continue;
            atmosphere.op.draw(m.id, r.oxygen);
            at = { furnace: m.id, item: input, progress: 0 };
          }
          const progress = Math.min(r.work, at.progress + share);
          if (progress >= r.work && items.query.canSmelt(m.id)) {
            items.op.smelt(m.id);
            continue;
          }
          kept.push({ ...at, progress });
        }
        ctx.state.smelting = kept;
      },
    },
  ],
});

export type FurnaceModule = typeof furnaceModule;
export const furnace = furnaceModule;
