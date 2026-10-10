import type { Layer, Placement } from '../grid';
import type { Cost } from '../stock';

/** What a plan asks for: something put in a cell, or what a layer of a cell holds taken out. */
export type Action = { readonly place: Placement } | { readonly clear: Layer };

/**
 * A plan, with the ticks of work done on it. A machine's is kept at its top-left cell, whichever cell
 * it was marked from. A plan to place records what was paid for it when work began, to refund
 * exactly that if it is cancelled.
 */
export type Plan = { readonly id: number; readonly cell: number; readonly progress: number } & (
  { readonly place: Placement; readonly paid: Cost } | { readonly clear: Layer }
);

export interface BuildingState {
  plans: Plan[];
  nextPlanId: number;
}
