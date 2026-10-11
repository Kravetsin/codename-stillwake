import { defineModule, type QueryApi } from '../../core/module';
import type { GridModule } from '../grid';
import { findRooms, reopen, SOLID, SPACE, type Room } from './flood';

export type { Room } from './flood';

export interface RoomsState {
  /** Derived: per cell, the id of its room, SPACE or SOLID. */
  roomOf: Int32Array;
  /** Derived: every room, in id order. */
  rooms: Room[];
  /** Derived: the grid's structure and back layers the rooms were found in. */
  builtFrom: Int32Array;
  builtBack: Int32Array;
}

function rebuild(state: RoomsState, grid: QueryApi<GridModule>): void {
  const layers = grid.layers();
  const { structure, back } = grid.codes();
  const found = findRooms({
    width: layers.width,
    height: layers.height,
    structure: layers.structure,
    solid: [structure.wall, structure.doorClosed],
    doorOpen: structure.doorOpen,
    back: layers.back,
    backWall: back.wall,
  });
  state.roomOf = found.roomOf;
  state.rooms = found.rooms;
  state.builtFrom = Int32Array.from(layers.structure);
  state.builtBack = Int32Array.from(layers.back);
}

/** Whether `layer` still is `copy`, the one the rooms were found in. */
function same(copy: Int32Array, layer: readonly number[]): boolean {
  if (copy.length !== layer.length) return false;
  for (let cell = 0; cell < layer.length; cell++) if (copy[cell] !== layer[cell]) return false;
  return true;
}

const roomsModule = defineModule<[GridModule]>()({
  id: 'rooms',
  dependsOn: ['grid'],
  init: (): RoomsState => ({
    roomOf: new Int32Array(0),
    rooms: [],
    builtFrom: new Int32Array(0),
    builtBack: new Int32Array(0),
  }),

  derived: {
    keys: ['roomOf', 'rooms', 'builtFrom', 'builtBack'],
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
    /**
     * Per cell, live and read-only: a room's id (never negative), or a negative number for space and
     * solid cells. For a module that walks every cell; one cell at a time, use `roomAt`.
     */
    roomOfCells: (ctx): Readonly<Int32Array> => ctx.state.roomOf,
    room: (ctx, id: number) => ctx.state.rooms.find((room) => room.id === id),
    rooms: (ctx) => ctx.state.rooms,
  },

  systems: [
    {
      // Compared every tick rather than told by the grid, so no change to a structure is missed.
      phase: 'derivation',
      run(ctx) {
        const grid = ctx.deps.grid.query;
        const { structure, back, width } = grid.layers();
        if (!same(ctx.state.builtFrom, structure)) rebuild(ctx.state, grid);
        else if (!same(ctx.state.builtBack, back)) {
          // Only back walls changed: the rooms stand, their openings move.
          const state = ctx.state;
          state.rooms = reopen(state.roomOf, state.rooms, width, back, grid.codes().back.wall);
          state.builtBack = Int32Array.from(back);
        }
      },
    },
  ],
});

export type RoomsModule = typeof roomsModule;
export const rooms = roomsModule;
