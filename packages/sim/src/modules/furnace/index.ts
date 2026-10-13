import { FURNACE, ITEMS, type ItemSpec } from '@stillwake/content';
import { defineModule, type QueryApi } from '../../core/module';
import type { AtmosphereModule } from '../atmosphere';
import type { GridModule, Machine } from '../grid';
import type { Item, ItemsModule } from '../items';

/** A furnace's fire, and the item it smelts, by machine id. */
export interface Fire {
  readonly furnace: number;
  /** Ticks of fire left: lit while above 0. */
  readonly fuel: number;
  /** The item it is at work on, and its work done on it in ticks of fire. */
  readonly item?: Item;
  readonly progress: number;
}

export interface FurnaceState {
  /** Every furnace burning or part-way through an item, by machine id, in id order. */
  fires: Fire[];
}

/** Why a furnace with salvage in its input is not at work, as an i18n key. */
export type FurnaceProblem = 'furnace.full' | 'furnace.noFuel' | 'furnace.noAir';

type Deps = [GridModule, ItemsModule, AtmosphereModule];

const spec = (item: Item | undefined): ItemSpec | undefined =>
  item === undefined ? undefined : ITEMS[item];

const furnaceModule = defineModule<Deps>()({
  id: 'furnace',
  dependsOn: ['grid', 'items', 'atmosphere'],
  init: (): FurnaceState => ({ fires: [] }),

  queries: {
    /**
     * Furnace `id` as its panel shows it: whether its fire burns; with salvage in its input, what it
     * smelts, how far, out of how much work, and why it stands still if it does.
     */
    at(ctx, id: number) {
      const { grid, items, atmosphere } = ctx.deps;
      const fire = ctx.state.fires.find((f) => f.furnace === id);
      const burning = (fire?.fuel ?? 0) > 0;
      const slots = items.query.crate(id);
      const input = slots[0]?.item;
      const work = spec(input)?.smeltTicks;
      if (input === undefined || work === undefined) return { burning };
      const machine = grid.query.machines().find((m) => m.id === id);
      const aired = machine !== undefined && airedCell(grid.query, atmosphere.query, machine) >= 0;
      const fuel = spec(slots[FURNACE.fuelSlot]?.item)?.burnTicks;
      const problem: FurnaceProblem | undefined = !items.query.canSmelt(id)
        ? 'furnace.full'
        : !burning && fuel === undefined
          ? 'furnace.noFuel'
          : !aired
            ? 'furnace.noAir'
            : undefined;
      const progress = fire?.item === input ? fire.progress : 0;
      return { burning, item: input, progress, work, problem };
    },
  },

  systems: [
    {
      phase: 'simulation',
      run(ctx) {
        const { grid, items, atmosphere } = ctx.deps;
        const kept: Fire[] = [];
        for (const m of grid.query.machines()) {
          if (m.kind !== 'furnace') continue;
          const was = ctx.state.fires.find((f) => f.furnace === m.id);
          let fuel = was?.fuel ?? 0;
          const slots = items.query.crate(m.id);
          const input = slots[0]?.item;
          const work = spec(input)?.smeltTicks;
          const smelts = work !== undefined && items.query.canSmelt(m.id);
          // Work on another item, or none, begins again.
          let item = was?.item === input ? was?.item : undefined;
          let progress = item === undefined ? 0 : (was?.progress ?? 0);
          const cell = airedCell(grid.query, atmosphere.query, m);
          // Lit only with something to smelt, fuel and air, which a fuel is used up for.
          const burns = spec(slots[FURNACE.fuelSlot]?.item)?.burnTicks;
          if (fuel === 0 && smelts && burns !== undefined && cell >= 0) {
            items.op.consume(m.id, FURNACE.fuelSlot);
            fuel = burns;
          }
          if (fuel > 0) {
            // It breathes as a hero does: given less, its fire goes out and the fuel left is lost.
            const breathes = fuel % FURNACE.breathEvery === 0;
            const had = !breathes
              ? FURNACE.breath
              : cell < 0
                ? 0
                : atmosphere.op.breathe(cell, FURNACE.breath);
            if (had < FURNACE.breath) {
              fuel = 0;
            } else {
              fuel -= 1;
              if (smelts && input !== undefined) {
                item = input;
                progress += 1;
                if (progress >= (work ?? 0)) {
                  items.op.smelt(m.id);
                  item = undefined;
                  progress = 0;
                }
              }
            }
          }
          if (fuel > 0 || item !== undefined) {
            kept.push({ furnace: m.id, fuel, ...(item === undefined ? {} : { item }), progress });
          }
        }
        ctx.state.fires = kept;
      },
    },
  ],
});

/** The first cell of machine `m` with air in it, or -1: where its fire breathes. */
function airedCell(
  grid: QueryApi<GridModule>,
  air: QueryApi<AtmosphereModule>,
  m: Readonly<Machine>,
): number {
  return (grid.footprint(m.kind, m.cell) ?? []).find((c) => air.airedAt(c)) ?? -1;
}

export type FurnaceModule = typeof furnaceModule;
export const furnace = furnaceModule;
