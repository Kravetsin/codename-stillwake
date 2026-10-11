import type { Platform, SaveStore } from './platform';

/** What the desktop shell's preload hands the page (`apps/desktop/src/preload.cjs`). */
interface DesktopBridge {
  readonly saves: SaveStore;
}

declare global {
  interface Window {
    /** Set by the desktop shell; absent in a browser. */
    readonly stillwakeDesktop?: DesktopBridge;
  }
}

/** The platform this page runs on: the desktop shell's when it has one, else the browser's. */
export function currentPlatform(browser: () => Platform): Platform {
  const desktop = window.stillwakeDesktop;
  return desktop ? { saves: desktop.saves } : browser();
}
