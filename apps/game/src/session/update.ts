import { createStore } from './store';

/** How often a page served from the playtest server asks which build it serves now. */
export const CHECK_MS = 30_000;
/** Set while a page reloads into a new build, so the world it saved comes back. */
const RESUME_KEY = 'stillwake:resume';

/** A build newer than this page's, once the server says it serves one. */
export const newBuild = createStore<string | undefined>(undefined);

/** Why the world started anew after an update, if it did: the save was of another format. */
export const startedAnew = createStore(false);

/** The build the server serves now, from `version.json` beside the page; none if it cannot say. */
export async function servedBuild(
  get: (url: string) => Promise<Response> = (url) => fetch(url, { cache: 'no-store' }),
): Promise<string | undefined> {
  try {
    const response = await get('version.json');
    if (!response.ok) return undefined;
    const { build } = (await response.json()) as { build?: unknown };
    return typeof build === 'string' ? build : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Asks every `CHECK_MS` which build the server serves, and sets `newBuild` once it differs from
 * `current`. Returns how to stop asking.
 */
export function watchForUpdates(current: string, ask = servedBuild): () => void {
  const check = () =>
    void ask().then((build) => {
      if (build !== undefined && build !== current) newBuild.set(build);
    });
  const timer = setInterval(check, CHECK_MS);
  return () => clearInterval(timer);
}

/** Marks the next load of this page as a reload into a new build, its world saved to resume. */
export function markResume(storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(RESUME_KEY, '1');
  } catch {
    // Without storage the world simply starts anew.
  }
}

/** Whether this load is a reload into a new build; asking clears it, so it answers once. */
export function takeResume(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined = safeStorage(),
): boolean {
  try {
    const resume = storage?.getItem(RESUME_KEY) === '1';
    storage?.removeItem(RESUME_KEY);
    return resume;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
