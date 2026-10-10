import type { Layer, Placement } from '../grid';

/** What a plan asks for: something put in a cell, or what a layer of a cell holds taken out. */
export type Action = { readonly place: Placement } | { readonly clear: Layer };

/** A plan; a machine's is kept at its top-left cell, whichever cell it was marked from. */
export type Plan = { readonly id: number; readonly cell: number } & Action;

export interface BuildingState {
  plans: Plan[];
  nextPlanId: number;
}
