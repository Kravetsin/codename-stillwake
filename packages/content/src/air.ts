/** Oxygen, in whole units: what a tank holds and what one canister brings. */
export const AIR = {
  tankCapacity: 1000,
  canister: 250,
} as const satisfies Readonly<Record<string, number>>;
