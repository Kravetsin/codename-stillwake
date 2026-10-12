import { defineModule, refuse, withFuzz, type Ctx } from '../../core/module';
import type { GridModule, Layer, Placement } from '../grid';
import type { ItemsModule } from '../items';
import type { PowerModule } from '../power';
import { buildOf, builtAt, ticksFor } from './costs';
import { fuzzBuilding } from './fuzz';
import { clearAt, covers, markedCell, planProblem, workProblem } from './rules';
import type { Action, BuildingState, Plan } from './state';

export type { Action, BuildingState, Plan } from './state';

type Deps = [GridModule, ItemsModule, PowerModule];

/**
 * Builds what a plan asks for, or takes apart what a mark names and refunds it to the hero of peer
 * `from`; drops the plan.
 */
function complete(ctx: Ctx<BuildingState, Deps, never>, plan: Plan, from: number): void {
  const { grid, items } = ctx.deps;
  if ('place' in plan) {
    // Plans claim their slots, so nothing can fill one first: a refusal here is our bug.
    grid.op.place(plan.cell, plan.place);
  } else {
    // What a mark names may be gone already, to a meteor: then there is nothing to refund.
    const built = builtAt(grid.query, plan.cell, plan.clear);
    if (built) {
      grid.op.clear(plan.cell, plan.clear);
      items.op.give(from, built.cost);
    }
  }
  ctx.state.plans = ctx.state.plans.filter((p) => p.id !== plan.id);
}

const buildingModule = defineModule<Deps>()({
  id: 'building',
  dependsOn: ['grid', 'items', 'power'],
  init: (): BuildingState => ({ plans: [], nextPlanId: 1 }),

  queries: {
    plans: (ctx) => ctx.state.plans,
    /** Every plan covering `cell`, in the order they were made. */
    plansAt: (ctx, cell: number) =>
      ctx.state.plans.filter((p) => covers(ctx.deps.grid.query, p).includes(cell)),
    /** The layer a deconstruct tool takes from `cell`, and the cell its mark is kept at. */
    clearAt: (ctx, cell: number) => clearAt(ctx.deps.grid.query, ctx.state.plans, cell),
    /** Why `action` cannot be planned at `cell`: what a ghost shows before the command is sent. */
    problem: (ctx, cell: number, action: Action) =>
      planProblem(
        ctx.deps.grid.query,
        ctx.deps.items.query,
        ctx.deps.power.query,
        ctx.state.plans,
        cell,
        action,
      ),
    /** Why peer `peer`'s work on plan `id` would be refused: what the client shows first. */
    workProblem: (ctx, id: number, peer: number) =>
      workProblem(
        ctx.deps.grid.query,
        ctx.deps.items.query,
        ctx.deps.power.query,
        ctx.state.plans,
        id,
        peer,
      ),
    /** Ticks of work plan `id` takes in all, for its progress bar. */
    ticksFor: (ctx, id: number) => {
      const plan = ctx.state.plans.find((p) => p.id === id);
      return plan && ticksFor(ctx.deps.grid.query, plan);
    },
  },

  commands: {
    placePlan: {
      validate(ctx, p: { cell: number; placement: Placement }) {
        const why = planProblem(
          ctx.deps.grid.query,
          ctx.deps.items.query,
          ctx.deps.power.query,
          ctx.state.plans,
          p.cell,
          {
            place: p.placement,
          },
        );
        if (why) return refuse(why);
      },
      apply(ctx, p: { cell: number; placement: Placement }) {
        const id = ctx.state.nextPlanId;
        ctx.state.plans.push({ id, cell: p.cell, progress: 0, place: p.placement, paid: {} });
        ctx.state.nextPlanId += 1;
      },
    },
    deconstruct: {
      validate(ctx, p: { cell: number; layer: Layer }) {
        const why = planProblem(
          ctx.deps.grid.query,
          ctx.deps.items.query,
          ctx.deps.power.query,
          ctx.state.plans,
          p.cell,
          {
            clear: p.layer,
          },
        );
        if (why) return refuse(why);
      },
      apply(ctx, p: { cell: number; layer: Layer }) {
        const cell = markedCell(ctx.deps.grid.query, p.cell, p.layer) ?? p.cell;
        ctx.state.plans.push({ id: ctx.state.nextPlanId, cell, progress: 0, clear: p.layer });
        ctx.state.nextPlanId += 1;
      },
    },
    cancelPlan: {
      validate(ctx, p: { id: number }) {
        const plan = ctx.state.plans.find((each) => each.id === p.id);
        if (!plan) return refuse('building.noPlan');
        const why = 'place' in plan && ctx.deps.items.query.fullFor(ctx.from, plan.paid);
        if (why) return refuse(why);
      },
      apply(ctx, p: { id: number }) {
        const plan = ctx.state.plans.find((each) => each.id === p.id);
        // What was paid goes back to whoever cancels: not always the hero who paid.
        if (plan && 'place' in plan) ctx.deps.items.op.give(ctx.from, plan.paid);
        ctx.state.plans = ctx.state.plans.filter((each) => each.id !== p.id);
      },
    },
    /**
     * One tick of a hero's work on a plan, sent every tick the player holds E on it within reach.
     * The first tick of a plan to place pays for it from the worker; the last completes it.
     */
    work: {
      validate(ctx, p: { plan: number }) {
        const why = workProblem(
          ctx.deps.grid.query,
          ctx.deps.items.query,
          ctx.deps.power.query,
          ctx.state.plans,
          p.plan,
          ctx.from,
        );
        if (why) return refuse(why);
      },
      apply(ctx, p: { plan: number }) {
        const at = ctx.state.plans.findIndex((each) => each.id === p.plan);
        const plan = ctx.state.plans[at] as Plan;
        const paid =
          'place' in plan && plan.progress === 0
            ? { paid: ctx.deps.items.op.take(ctx.from, buildOf(plan.place).cost) }
            : {};
        const worked = { ...plan, ...paid, progress: plan.progress + 1 } as Plan;
        ctx.state.plans[at] = worked;
        if (worked.progress >= ticksFor(ctx.deps.grid.query, worked))
          complete(ctx, worked, ctx.from);
      },
    },
  },

  systems: [
    {
      // A mark whose thing a meteor broke has nothing left to take apart. In derivation, after every
      // construction system, so a hit made in any phase before is seen on its tick.
      phase: 'derivation',
      run(ctx) {
        const grid = ctx.deps.grid.query;
        const gone = (p: Plan) => 'clear' in p && markedCell(grid, p.cell, p.clear) === undefined;
        if (ctx.state.plans.some(gone)) ctx.state.plans = ctx.state.plans.filter((p) => !gone(p));
      },
    },
  ],
});

export type BuildingModule = typeof buildingModule;
export const building = withFuzz(buildingModule, fuzzBuilding);
