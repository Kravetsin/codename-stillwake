/** Set by Vite from the commit the game was built from; see `vite.config.ts`. */
declare const __BUILD__: string | undefined;

/** Which build this is: peers must run the same one to share a world, so a join checks it. */
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'unknown';
