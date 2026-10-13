import { DEFAULT_HULL, MATERIALS } from '@stillwake/content';
import { cellsOf, machinesOf, type Layout } from '../../core/layout';
import { BACK, CONDUIT, STRUCTURE, type GridState } from './state';

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

/**
 * The grid a map describes, with the pipes the map under it draws. Every cell but a space has a back
 * wall of the default hull, hull walls included, so a map drawn before back walls keeps its meaning. Machines take ids 1,
 * 2, … in the order `machinesOf` lists them, which is how other modules find a map's machines by id.
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
    back: new Array<number>(size).fill(BACK.none),
    backMaterial: new Array<number>(size).fill(0),
    machines: [],
    nextMachineId: 1,
    occupancy: new Int32Array(0),
  };

  for (let cell = 0; cell < size; cell++) {
    const char = layout.rows[Math.floor(cell / width)]?.[cell % width] ?? ' ';
    if (char !== ' ') {
      state.back[cell] = BACK.wall;
      state.backMaterial[cell] = MATERIALS[DEFAULT_HULL].code;
    }
    const structure = STRUCTURE_CHARS[char];
    if (structure !== undefined) {
      state.structure[cell] = structure;
      if (structure === STRUCTURE.wall) state.material[cell] = MATERIALS[DEFAULT_HULL].code;
    }
    const conduit = CONDUIT_CHARS[char];
    if (conduit !== undefined) state.conduit[cell] = conduit;
  }
  for (const cell of cellsOf(layout, '-', true)) state.conduit[cell] = CONDUIT.pipe;
  for (const { kind, cell } of machinesOf(layout)) {
    state.machines.push({ id: state.nextMachineId, kind, cell });
    state.nextMachineId += 1;
  }
  return state;
}
