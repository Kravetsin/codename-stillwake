import { AIR } from '@stillwake/content';

/**
 * What a room leaking `leak` every `AIR.leakEvery` ticks uses on the air ticks after clock `from`, up
 * to `to`: the leak is spread over the period, what is due by the end of a tick less what was by its start.
 */
export function leaked(leak: number, from: number, to: number): number {
  let sum = 0;
  for (let clock = from + 1; clock <= to; clock++) {
    const beat = clock % AIR.leakEvery;
    sum +=
      Math.floor((leak * (beat + 1)) / AIR.leakEvery) - Math.floor((leak * beat) / AIR.leakEvery);
  }
  return sum;
}
