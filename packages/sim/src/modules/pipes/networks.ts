/** What `networkOf` holds for a cell in no network: no conduit, or a closed valve. */
export const NONE = -1;

export interface Network {
  /** Its smallest cell. */
  readonly id: number;
  /** Its pipes and open valves, in cell order. */
  readonly cells: readonly number[];
  /** The machines with a port on it, by id, in id order. */
  readonly machines: readonly number[];
}

export interface Conduits {
  readonly width: number;
  readonly height: number;
  readonly conduit: readonly number[];
  /** The conduit codes that carry: pipes and open valves. A closed valve does not. */
  readonly carrying: readonly number[];
  /** Every machine with the cells of its ports, in id order. */
  readonly machines: readonly { readonly id: number; readonly ports: readonly number[] }[];
}

/**
 * Splits the conduits into networks: components of the cells that carry, joined side by side. A
 * closed valve carries nothing, so it splits a run in two. A machine joins every network one of its
 * ports stands on. Typed arrays and no allocation per cell: it runs on every valve toggle.
 */
export function findNetworks(c: Conduits): { networkOf: Int32Array; networks: Network[] } {
  const { width, conduit } = c;
  const size = width * c.height;
  const carries = new Uint8Array(size);
  for (let cell = 0; cell < size; cell++) {
    if (c.carrying.includes(conduit[cell] ?? -1)) carries[cell] = 1;
  }
  const networkOf = new Int32Array(size).fill(NONE);
  const networks: { id: number; cells: number[]; machines: number[] }[] = [];
  const index = new Map<number, number>();
  const queue = new Int32Array(size);

  const visit = (next: number, id: number, count: number): number => {
    if (!carries[next] || networkOf[next] !== NONE) return count;
    networkOf[next] = id;
    queue[count] = next;
    return count + 1;
  };
  for (let start = 0; start < size; start++) {
    if (!carries[start] || networkOf[start] !== NONE) continue;
    networkOf[start] = start;
    queue[0] = start;
    let count = 1;
    for (let head = 0; head < count; head++) {
      const cell = queue[head] as number;
      const x = cell % width;
      if (x > 0) count = visit(cell - 1, start, count);
      if (x < width - 1) count = visit(cell + 1, start, count);
      if (cell >= width) count = visit(cell - width, start, count);
      if (cell + width < size) count = visit(cell + width, start, count);
    }
    const cells = Array.from(queue.subarray(0, count)).sort((a, b) => a - b);
    index.set(start, networks.length);
    networks.push({ id: start, cells, machines: [] });
  }

  for (const machine of c.machines) {
    const joined: number[] = [];
    for (const port of machine.ports) {
      const id = networkOf[port] ?? NONE;
      if (id === NONE || joined.includes(id)) continue;
      joined.push(id);
      networks[index.get(id) as number]?.machines.push(machine.id);
    }
  }
  return { networkOf, networks };
}
