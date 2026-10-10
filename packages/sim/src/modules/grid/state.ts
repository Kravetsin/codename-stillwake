import { MATERIALS, type MachineKind, type MaterialId } from '@stillwake/content';

/** Structure codes as stored in saves: never reuse or renumber one. */
export const STRUCTURE = {
  empty: 0,
  wall: 1,
  floor: 2,
  ladder: 3,
  doorClosed: 4,
  doorOpen: 5,
} as const;

/** Conduit codes as stored in saves: never reuse or renumber one. */
export const CONDUIT = { none: 0, pipe: 1, valveOpen: 2, valveClosed: 3 } as const;

export interface Machine {
  readonly id: number;
  readonly kind: MachineKind;
  /** Its top-left cell. */
  readonly cell: number;
}

export interface GridState {
  width: number;
  height: number;
  /** One entry per cell, row by row from the top-left: a STRUCTURE code. */
  structure: number[];
  /** A material code from `MATERIALS` for walls, 0 elsewhere. */
  material: number[];
  /** A CONDUIT code per cell. Conduits run through walls and under machines. */
  conduit: number[];
  machines: Machine[];
  nextMachineId: number;
  /** Derived: the id of the machine covering each cell, 0 for none. */
  occupancy: Int32Array;
}

export type Placement =
  | { readonly layer: 'structure'; readonly kind: 'wall'; readonly material: MaterialId }
  | { readonly layer: 'structure'; readonly kind: 'floor' | 'ladder' | 'door' }
  | { readonly layer: 'conduit'; readonly kind: 'pipe' | 'valve' }
  | { readonly layer: 'machine'; readonly kind: MachineKind };

export type Layer = Placement['layer'];

export const materialByCode = new Map<number, MaterialId>(
  (Object.entries(MATERIALS) as [MaterialId, { code: number }][]).map(([id, m]) => [m.code, id]),
);
