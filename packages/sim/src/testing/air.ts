import { AIR } from '@stillwake/content';

/** What a room leaking `leak` a minute pays on the air ticks after clock `from`, up to `to`. */
export function leaked(leak: number, from: number, to: number): number {
  return (Math.floor(to / AIR.leakEvery) - Math.floor(from / AIR.leakEvery)) * leak;
}
