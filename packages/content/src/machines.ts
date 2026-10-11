import type { Build } from './builds';

export interface MachineSpec extends Build {
  /** Footprint in cells, from the machine's top-left cell. */
  readonly width: number;
  readonly height: number;
  /** Where conduits connect, as offsets inside the footprint; none for a crate. */
  readonly ports: readonly { readonly x: number; readonly y: number }[];
}

export const MACHINES = {
  tank: {
    width: 2,
    height: 2,
    ports: [{ x: 0, y: 1 }],
    cost: { scrap: 4, steel: 4 },
    buildTicks: 160,
  },
  vent: { width: 1, height: 1, ports: [{ x: 0, y: 0 }], cost: { scrap: 2 }, buildTicks: 60 },
  crate: { width: 2, height: 1, ports: [], cost: { scrap: 6 }, buildTicks: 40 },
} as const satisfies Readonly<Record<string, MachineSpec>>;

export type MachineKind = keyof typeof MACHINES;
