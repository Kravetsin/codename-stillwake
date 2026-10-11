/** How one peer's world differed from the host's, module by module, on one tick. */
export interface DesyncReport {
  readonly tick: number;
  /** Whether the world's random generator had drifted too. */
  readonly rng: boolean;
  /** Each module whose state differed, with the first paths that did, as `a.b[3].c`. */
  readonly modules: readonly { readonly id: string; readonly paths: readonly string[] }[];
}

/** Paths listed per module: enough to find the bug, not a dump of a drifted grid. */
const MAX_PATHS = 10;

interface Saved {
  readonly world: {
    readonly tick: number;
    readonly rng: unknown;
    readonly slices: Readonly<Record<string, unknown>>;
  };
}

/** How the world saved in `mine` differs from the one in `theirs`: the two saves of one tick. */
export function diffSaves(mine: string, theirs: string): DesyncReport {
  const a = (JSON.parse(mine) as Saved).world;
  const b = (JSON.parse(theirs) as Saved).world;
  const ids = [...new Set([...Object.keys(a.slices), ...Object.keys(b.slices)])].sort();
  const modules = ids.flatMap((id) => {
    const paths: string[] = [];
    walk(a.slices[id], b.slices[id], id, paths);
    return paths.length > 0 ? [{ id, paths }] : [];
  });
  return { tick: b.tick, rng: JSON.stringify(a.rng) !== JSON.stringify(b.rng), modules };
}

/** Adds to `paths` where `a` and `b` differ, depth first, until there are `MAX_PATHS`. */
function walk(a: unknown, b: unknown, at: string, paths: string[]): void {
  if (paths.length >= MAX_PATHS) return;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    if (a !== b) paths.push(at);
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return void paths.push(at);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) paths.push(`${at}.length`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${at}[${i}]`, paths);
    return;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const key of [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()) {
    walk(ra[key], rb[key], `${at}.${key}`, paths);
  }
}
