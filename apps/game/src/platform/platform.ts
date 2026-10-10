/**
 * Everything the game needs from where it runs. The browser is the development build; Electron
 * (P1-51) is the second implementation, so game code never reaches either directly.
 */
export interface Platform {
  readonly saves: SaveStore;
}

/** Save files by slot name; the text is whatever `Sim.save()` wrote. */
export interface SaveStore {
  read(slot: string): Promise<string | undefined>;
  write(slot: string, text: string): Promise<void>;
}
