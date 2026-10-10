/** The world's random state; saved and hashed with the world. */
export interface RngState {
  s: number;
}

export interface Rng {
  /** A uniform integer in `[0, n)`; `n` is a positive integer no larger than 2^32. */
  below(n: number): number;
}

const SPAN = 4294967296;

/** A generator of its own, outside any world: for tests and tools, never for the sim. */
export function createRng(seed: number): Rng {
  return rngOver(seedRng(seed));
}

export function seedRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** mulberry32: integer-only, so every peer draws the same sequence. */
export function rngOver(state: RngState): Rng {
  const next = (): number => {
    let t = (state.s = (state.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    below(n) {
      if (!Number.isInteger(n) || n < 1 || n > SPAN) throw new RangeError(`below(${n})`);
      // Rejection keeps the draw unbiased: values past the last whole multiple of n are redrawn.
      const limit = SPAN - (SPAN % n);
      let v = next();
      while (v >= limit) v = next();
      return v % n;
    },
  };
}
