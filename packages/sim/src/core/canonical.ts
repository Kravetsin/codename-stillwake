/**
 * JSON with sorted keys, so equal states give equal text on every peer. State is a tree of plain
 * data: anything that would not survive a save unchanged throws, with the path to it.
 */
export function canonicalJson(value: unknown): string {
  return write(value, '$', new Set());
}

/** A deep copy through `canonicalJson`: also proves the value is plain data. */
export function plainCopy<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

function write(value: unknown, at: string, seen: Set<object>): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${at}: ${value} is not plain data`);
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError(`${at}: ${typeof value} is not plain data`);

  // One object in two places is two objects after a load: the worlds would part from there on.
  if (seen.has(value)) throw new TypeError(`${at}: the same object appears twice in state`);
  seen.add(value);

  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) throw new TypeError(`${at}[${i}]: a hole in an array is not plain data`);
      items.push(write(value[i], `${at}[${i}]`, seen));
    }
    return `[${items.join(',')}]`;
  }

  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(`${at}: ${describe(value)} is not plain data`);
  }
  const entries = Object.entries(value)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => {
      // A key holding `undefined` is gone after a load; remove keys with `delete` instead.
      if (v === undefined) throw new TypeError(`${at}.${k}: undefined is not plain data`);
      return `${JSON.stringify(k)}:${write(v, `${at}.${k}`, seen)}`;
    });
  return `{${entries.join(',')}}`;
}

function describe(value: object): string {
  const ctor: unknown = (value as { constructor?: unknown }).constructor;
  return typeof ctor === 'function' ? ctor.name : 'an object';
}

/** cyrb53: a fast 53-bit hash, plenty to tell two peers' states apart. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const high = (h2 & 0x1fffff).toString(16).padStart(6, '0');
  const low = (h1 >>> 0).toString(16).padStart(8, '0');
  return high + low;
}
