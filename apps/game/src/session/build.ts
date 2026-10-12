/** Set by Vite from the commit the game was built from, and the day; see `vite.config.ts`. */
declare const __BUILD__: string | undefined;
declare const __BUILT__: string | undefined;

/** Which build this is: peers must run the same one to share a world, so a join checks it. */
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'unknown';

/** The day this build was made, as `YYYY-MM-DD`. */
export const BUILT: string = typeof __BUILT__ === 'string' ? __BUILT__ : 'unknown';

/** This build as a player reads it in a screenshot: the day, then the commit. */
export function versionOf(build: string, built: string): string {
  const [, month, day] = built.split('-');
  return month && day ? `${day}.${month} · ${build}` : build;
}
