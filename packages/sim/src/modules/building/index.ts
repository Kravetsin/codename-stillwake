import { defineModule, refuse, withFuzz, type Ctx } from '../../core/module';
import type { GridModule, Layer, Placement } from '../grid';
import type { StockModule } from '../stock';
import { buildOf, builtAt, ticksFor } from './costs';
import { fuzzBuilding } from './fuzz';
import { clearAt, covers, markedCell, planProblem, workProblem } from './rules';
import type { Action, BuildingState, Plan } from './state';

export type { Action, BuildingState, Plan } from './state';

type Deps = [GridModule, StockModule];

/** Builds what a plan asks for, or takes apart what a mark names and refunds it; drops the plan. */
function complete(ctx: Ctx<BuildingState, Deps, never>, plan: Plan): void {
  const { grid, stock } = ctx.deps;
  if ('place' in plan) {
    // Plans claim their slots, so nothing can fill one first: a refusal here is our bug.
    grid.op.place(plan.cell, plan.place);
  } else {
    const built = builtAt(grid.query, plan.cell, plan.clear);
    if (!built) throw new Error(`building: plan ${plan.id} marks nothing at ${plan.cell}`);
    grid.op.clear(plan.cell, plan.clear);
    stock.op.refund(built.cost);
  }
  ctx.state.plans = ctx.state.plans.filter((p) => p.id !== plan.id);
}

const buildingModule = defineModule<Deps>()({
  id: 'building',
  dependsOn: ['grid', 'stock'],
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
      planProblem(ctx.deps.grid.query, ctx.state.plans, cell, action),
    /** Why work on plan `id` would be refused: what the client shows before sending it. */
    workProblem: (ctx, id: number) => workProblem(ctx.deps.stock.query, ctx.state.plans, id),
    /** Ticks of work plan `id` takes in all, for its progress bar. */
    ticksFor: (ctx, id: number) => {
      const plan = ctx.state.plans.find((p) => p.id === id);
      return plan && ticksFor(ctx.deps.grid.query, plan);
    },
  },

  commands: {
    placePlan: {
      validate(ctx, p: { cell: number; placement: Placement }) {
        const why = planProblem(ctx.deps.grid.query, ctx.state.plans, p.cell, {
          place: p.placement,
        });
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
        const why = planProblem(ctx.deps.grid.query, ctx.state.plans, p.cell, { clear: p.layer });
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
        if (!ctx.state.plans.some((plan) => plan.id === p.id)) return refuse('building.noPlan');
      },
      apply(ctx, p: { id: number }) {
        const plan = ctx.state.plans.find((each) => each.id === p.id);
        if (plan && 'place' in plan) ctx.deps.stock.op.refund(plan.paid);
        ctx.state.plans = ctx.state.plans.filter((each) => each.id !== p.id);
      },
    },
    /**
     * One tick of a hero's work on a plan, sent every tick the player holds E on it within reach.
     * The first tick of a plan to place pays for it; the last completes it.
     */
    work: {
      validate(ctx, p: { plan: number }) {
        const why = workProblem(ctx.deps.stock.query, ctx.state.plans, p.plan);
        if (why) return refuse(why);
      },
      apply(ctx, p: { plan: number }) {
        const at = ctx.state.plans.findIndex((each) => each.id === p.plan);
        const plan = ctx.state.plans[at] as Plan;
        const paid =
          'place' in plan && plan.progress === 0
            ? { paid: ctx.deps.stock.op.spend(buildOf(plan.place).cost) }
            : {};
        const worked = { ...plan, ...paid, progress: plan.progress + 1 } as Plan;
        ctx.state.plans[at] = worked;
        if (worked.progress >= ticksFor(ctx.deps.grid.query, worked)) complete(ctx, worked);
      },
    },
  },
});

export type BuildingModule = typeof buildingModule;
export const building = withFuzz(buildingModule, fuzzBuilding);
