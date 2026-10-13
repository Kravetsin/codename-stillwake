export interface Material {
  /** Stored in saves instead of the name: never reuse or renumber a code. */
  readonly code: number;
  /** Hits from meteors a hull cell takes before it breaks. */
  readonly strength: number;
  /** Oxygen units lost per minute through one outer hull cell of an aired room. */
  readonly leak: number;
  /** Units of this material spent to build one cell. */
  readonly cost: number;
  /** Ticks of a hero's work to build one cell. */
  readonly buildTicks: number;
}

/** Hull materials, weakest first. */
export const MATERIALS = {
  scrap: { code: 1, strength: 2, leak: 3, cost: 2, buildTicks: 13 },
  steel: { code: 2, strength: 5, leak: 1, cost: 3, buildTicks: 27 },
} as const satisfies Readonly<Record<string, Material>>;

export type MaterialId = keyof typeof MATERIALS;

/** What a `#` on a map is built of. */
export const DEFAULT_HULL: MaterialId = 'scrap';
