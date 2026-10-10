import { defineModule, type QueryApi } from '../../core/module';
import type { GridModule } from '../grid';
import { findRooms, SOLID, SPACE, type Room } from './flood';

export type { Room } from './flood';

export interface RoomsState {
  /** Derived: per cell, the id of its room, SPACE or SOLID. */
  roomOf: Int32Array;
  /** Derived: every room, in id order. */
  rooms: Room[];
  /** Derived: the grid's structure layer the rooms were found in. */
  builtFrom: Int32Array;
}

function rebuild(state: RoomsState, grid: QueryApi<GridModule>): void {
  const layers = grid.layers();
  const { structure } = grid.codes();
  const found = findRooms({
    width: layers.width,
    height: layers.height,
    structure: layers.structure,
    solid: [structure.wall, structure.doorClosed],
    doorOpen: structure.doorOpen,
  });
  state.roomOf = found.roomOf;
  state.rooms = found.rooms;
  state.builtFrom = Int32Array.from(layers.structure);
}

/** Whether the grid's structure still is what the rooms were found in. */
function current(state: Readonly<RoomsState>, structure: readonly number[]): boolean {
  if (state.builtFrom.length !== structure.length) return false;
  for (let cell = 0; cell < structure.length; cell++) {
    if (state.builtFrom[cell] !== structure[cell]) return false;
  }
  return true;
}

const roomsModule = defineModule<[GridModule]>()({
  id: 'rooms',
  dependsOn: ['grid'],
  init: (): RoomsState => ({
    roomOf: new Int32Array(0),
    rooms: [],
    builtFrom: new Int32Array(0),
  }),

  derived: {
    keys: ['roomOf', 'rooms', 'builtFrom'],
    rebuild(ctx) {
      rebuild(ctx.state, ctx.deps.grid.query);
    },
  },

  queries: {
    /** The room `cell` is in, `'space'`, or nothing for a solid cell or one off the grid. */
    roomAt(ctx, cell: number): number | 'space' | undefined {
      const id = ctx.state.roomOf[cell];
      if (id === undefined || id === SOLID) return undefined;
      return id === SPACE ? 'space' : id;
    },
    room: (ctx, id: number) => ctx.state.rooms.find((room) => room.id === id),
    rooms: (ctx) => ctx.state.rooms,
  },

  systems: [
    {
      // Compared every tick rather than told by the grid, so no change to a structure is missed.
      phase: 'derivation',
      run(ctx) {
        const grid = ctx.deps.grid.query;
        if (!current(ctx.state, grid.layers().structure)) rebuild(ctx.state, grid);
      },
    },
  ],
});

export type RoomsModule = typeof roomsModule;
export const rooms = roomsModule;
