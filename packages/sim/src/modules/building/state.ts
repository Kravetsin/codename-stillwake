import type { Layer, Placement } from '../grid';
import type { Cost } from '../items';

/** What a plan asks for: something put in a cell, or what a layer of a cell holds taken out. */
export type Action = { readonly place: Placement } | { readonly clear: Layer };

/**
 * A plan: a blueprint, to place something, with what was delivered to it so far; or a mark, to take
 * out what a layer of a cell holds. A machine's is kept at its top-left cell, whichever cell it was
 * marked from.
 */
export type Plan = { readonly id: number; readonly cell: number } & (
  { readonly place: Placement; readonly delivered: Cost } | { readonly clear: Layer }
);

export interface BuildingState {
  plans: Plan[];
  nextPlanId: number;
}
