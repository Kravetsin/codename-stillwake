import { DEFAULT_HULL, MACHINES, MATERIALS, type MachineKind } from '@stillwake/content';
import type { Layout } from '../../core/layout';
import { CONDUIT, STRUCTURE, type GridState } from './state';

const STRUCTURE_CHARS: Readonly<Record<string, number>> = {
  '#': STRUCTURE.wall,
  '=': STRUCTURE.floor,
  H: STRUCTURE.ladder,
  D: STRUCTURE.doorClosed,
  d: STRUCTURE.doorOpen,
};

const CONDUIT_CHARS: Readonly<Record<string, number>> = {
  '-': CONDUIT.pipe,
  v: CONDUIT.valveOpen,
  x: CONDUIT.valveClosed,
};

const MACHINE_CHARS: Readonly<Record<string, MachineKind>> = { T: 'tank', V: 'vent' };

/**
 * The grid a map describes. A machine is drawn as its whole footprint; read in reading order, each
 * unclaimed machine character starts one machine whose footprint must be drawn in full.
 */
export function gridFromLayout(layout: Layout): GridState {
  const { width, height } = layout;
  const size = width * height;
  const state: GridState = {
    width,
    height,
    structure: new Array<number>(size).fill(STRUCTURE.empty),
    material: new Array<number>(size).fill(0),
    conduit: new Array<number>(size).fill(CONDUIT.none),
    machines: [],
    nextMachineId: 1,
    occupancy: new Int32Array(0),
  };
  const claimed = new Set<number>();

  for (let cell = 0; cell < size; cell++) {
    const x = cell % width;
    const y = Math.floor(cell / width);
    const char = layout.rows[y]?.[x] ?? ' ';

    const structure = STRUCTURE_CHARS[char];
    if (structure !== undefined) {
      state.structure[cell] = structure;
      if (structure === STRUCTURE.wall) state.material[cell] = MATERIALS[DEFAULT_HULL].code;
    }
    const conduit = CONDUIT_CHARS[char];
    if (conduit !== undefined) state.conduit[cell] = conduit;

    const kind = MACHINE_CHARS[char];
    if (kind === undefined || claimed.has(cell)) continue;
    const spec = MACHINES[kind];
    for (let dy = 0; dy < spec.height; dy++) {
      for (let dx = 0; dx < spec.width; dx++) {
        const covered = (y + dy) * width + x + dx;
        if (x + dx >= width || layout.rows[y + dy]?.[x + dx] !== char || claimed.has(covered)) {
          throw new Error(
            `Map cell (${x}, ${y}): a ${kind} is ${spec.width}×${spec.height}; draw its whole footprint with '${char}'.`,
          );
        }
        claimed.add(covered);
      }
    }
    state.machines.push({ id: state.nextMachineId, kind, cell });
    state.nextMachineId += 1;
  }
  return state;
}
