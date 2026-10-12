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

/**
 * The same hash over plain data, walked rather than written out: what `hashText(canonicalJson(...))`
 * tells apart this tells apart, without building a string the size of the save. Every peer walks
 * the world the same way: object keys sorted, numbers by their IEEE bits, each part tagged with its
 * kind and length. Checks nothing: a save, which writes the same data, does.
 */
export function hashState(value: unknown): string {
  const words = new Float64Array(1);
  const halves = new Uint32Array(words.buffer);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const mix = (c: number) => {
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  };
  const walk = (v: unknown): void => {
    if (v === null) return mix(1);
    switch (typeof v) {
      case 'boolean':
        return mix(v ? 2 : 3);
      case 'number':
        words[0] = v;
        mix(4);
        mix(halves[0] as number);
        return mix(halves[1] as number);
      case 'string':
        mix(5);
        mix(v.length);
        for (let i = 0; i < v.length; i++) mix(v.charCodeAt(i));
        return;
      case 'object': {
        if (Array.isArray(v)) {
          mix(6);
          mix(v.length);
          for (const item of v) walk(item);
          return;
        }
        const keys = Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        mix(7);
        mix(keys.length);
        for (const key of keys) {
          walk(key);
          walk((v as Record<string, unknown>)[key]);
        }
        return;
      }
      default:
        throw new TypeError(`${typeof v} is not plain data`);
    }
  };
  walk(value);
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 & 0x1fffff).toString(16).padStart(6, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
