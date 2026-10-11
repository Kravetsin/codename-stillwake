/**
 * Meteors, in ticks (20 a second): one hits a random wall of the outer hull about every `meteorEvery`
 * ticks — the first after exactly that, each next after half of it plus a random share of it.
 */
export const HAZARDS = {
  meteorEvery: 6000,
} as const satisfies Readonly<Record<string, number>>;
