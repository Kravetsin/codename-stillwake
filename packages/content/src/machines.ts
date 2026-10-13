import type { Build } from './builds';

export interface MachineSpec extends Build {
  /** Footprint in cells, from the machine's top-left cell. */
  readonly width: number;
  readonly height: number;
  /** Where conduits connect, as offsets inside the footprint; none for a crate. */
  readonly ports: readonly { readonly x: number; readonly y: number }[];
  /** Power it makes a tick, cabled to a network; only out in space, every cell of it. */
  readonly makes?: number;
  /** Power it draws a tick from its network, cabled to one. */
  readonly draws?: number;
  /**
   * Where a cable plugs into it, in pixels of its picture from its top-left, sixteen to a cell: given
   * with `makes` or `draws`, one socket a machine. Only drawn: the sim knows the machine as one node.
   */
  readonly plug?: { readonly x: number; readonly y: number };
  /** Item slots it holds, opened with E as a crate is. */
  readonly slots?: number;
  /**
   * How many of its first slots items are put into; the rest are only taken from. All of them when
   * not given. A move into it naming no slot goes to the first.
   */
  readonly inputs?: number;
}

export const MACHINES = {
  tank: {
    width: 2,
    height: 2,
    ports: [{ x: 0, y: 1 }],
    cost: { scrap: 4, iron: 4 },
    buildTicks: 160,
  },
  generator: {
    width: 2,
    height: 2,
    ports: [{ x: 0, y: 1 }],
    cost: { scrap: 8, iron: 6 },
    buildTicks: 200,
    draws: 4,
    plug: { x: 16, y: 5 },
  },
  solarPanel: {
    width: 3,
    height: 1,
    ports: [],
    cost: { scrap: 6, iron: 6 },
    buildTicks: 160,
    makes: 5,
    plug: { x: 24, y: 14 },
  },
  vent: { width: 1, height: 1, ports: [{ x: 0, y: 0 }], cost: { scrap: 2 }, buildTicks: 60 },
  lamp: {
    width: 1,
    height: 1,
    ports: [],
    cost: { scrap: 2 },
    buildTicks: 60,
    draws: 1,
    plug: { x: 11, y: 1 },
  },
  // Learns blueprints from what is put in its slot (ADR 0024).
  analyzer: {
    width: 2,
    height: 2,
    ports: [],
    cost: { scrap: 8, iron: 4 },
    buildTicks: 200,
    draws: 2,
    slots: 1,
    plug: { x: 26, y: 3 },
  },
  crate: {
    width: 2,
    height: 1,
    ports: [],
    cost: { planks: 6, iron: 2 },
    buildTicks: 40,
    slots: 27,
  },
  furnace: {
    width: 2,
    height: 2,
    ports: [],
    cost: { scrapChunk: 4, hullPlate: 2 },
    buildTicks: 200,
    // Its input, its fuel (`FURNACE.fuelSlot`), then three outputs.
    slots: 5,
    inputs: 2,
  },
} as const satisfies Readonly<Record<string, MachineSpec>>;

export type MachineKind = keyof typeof MACHINES;
