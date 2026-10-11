import { DEBRIS, type ItemId } from '@stillwake/content';
import { defineModule, refuse, withFuzz, type QueryApi } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { CrewModule } from '../crew';
import type { GridModule } from '../grid';
import type { ItemsModule } from '../items';
import type { RoomsModule } from '../rooms';
import { fuzzDebris } from './fuzz';

/** One piece drifting past, its middle at `x`, `y` in thousandths of a cell, always on the grid. */
export interface Piece {
  id: number;
  item: ItemId;
  x: number;
  y: number;
}

export interface DebrisState {
  /** The pieces out, in spawn order. */
  pieces: Piece[];
  /** The id the next piece takes: ids are never reused. */
  nextId: number;
  /** Ticks this module has run. */
  clock: number;
  /** The clock at which the next piece is due. */
  nextSpawn: number;
}

type Deps = [GridModule, CrewModule, RoomsModule, ItemsModule];

const UNIT = 1000;
const TOTAL_WEIGHT = DEBRIS.kinds.reduce((sum, kind) => sum + kind.weight, 0);

/** The cell under a piece's middle. */
export function cellOf(piece: Pick<Piece, 'x' | 'y'>, width: number): number {
  return Math.floor(piece.y / UNIT) * width + Math.floor(piece.x / UNIT);
}

/** A kind drawn by weight, walking `DEBRIS.kinds` in order. */
function kindOf(rng: Rng): ItemId {
  let roll = rng.below(TOTAL_WEIGHT);
  for (const kind of DEBRIS.kinds) {
    if (roll < kind.weight) return kind.item;
    roll -= kind.weight;
  }
  throw new Error('debris: a roll past the total weight');
}

/**
 * Why peer `peer` cannot grab piece `id`: it is gone; the hero or the piece is not in space; or the
 * hero has no room for it.
 */
function grabProblem(
  pieces: readonly Readonly<Piece>[],
  deps: {
    grid: QueryApi<GridModule>;
    crew: QueryApi<CrewModule>;
    rooms: QueryApi<RoomsModule>;
    items: QueryApi<ItemsModule>;
  },
  peer: number,
  id: number,
): string | undefined {
  const piece = pieces.find((p) => p.id === id);
  if (!piece) return 'debris.gone';
  const hero = deps.crew.hero(peer);
  const { width } = deps.grid.size();
  const outside = (cell: number) => deps.rooms.roomAt(cell) === 'space';
  if (!hero || !outside(hero.cell) || !outside(cellOf(piece, width))) return 'debris.notOutside';
  return deps.items.fullFor(peer, { [piece.item]: 1 });
}

const debrisModule = defineModule<Deps>()({
  id: 'debris',
  dependsOn: ['grid', 'crew', 'rooms', 'items'],
  init: (): DebrisState => ({ pieces: [], nextId: 1, clock: 0, nextSpawn: DEBRIS.every }),

  queries: {
    /** The pieces out, in spawn order; live and read-only. */
    pieces: (ctx) => ctx.state.pieces,
    /** The first piece, in spawn order, whose middle is in `cell`. */
    pieceAt: (ctx, cell: number) => {
      const { width } = ctx.deps.grid.query.size();
      return ctx.state.pieces.find((p) => cellOf(p, width) === cell);
    },
    /** Why peer `peer`'s grab of piece `id` would be refused: what the client shows first. */
    grabProblem: (ctx, peer: number, id: number) =>
      grabProblem(
        ctx.state.pieces,
        {
          grid: ctx.deps.grid.query,
          crew: ctx.deps.crew.query,
          rooms: ctx.deps.rooms.query,
          items: ctx.deps.items.query,
        },
        peer,
        id,
      ),
  },

  commands: {
    /** Catches piece `piece` into the sender's inventory as its salvage item. */
    grab: {
      validate(ctx, p: { piece: number }) {
        const why = grabProblem(
          ctx.state.pieces,
          {
            grid: ctx.deps.grid.query,
            crew: ctx.deps.crew.query,
            rooms: ctx.deps.rooms.query,
            items: ctx.deps.items.query,
          },
          ctx.from,
          p.piece,
        );
        if (why) return refuse(why);
      },
      apply(ctx, p: { piece: number }) {
        const at = ctx.state.pieces.findIndex((each) => each.id === p.piece);
        const [piece] = ctx.state.pieces.splice(at, 1);
        if (!piece) throw new Error('debris.grab: applied to a piece that is gone');
        ctx.deps.items.op.give(ctx.from, { [piece.item]: 1 });
      },
    },
  },

  systems: [
    {
      // After derivation, like the air: the grid's size is that of this tick.
      phase: 'simulation',
      run(ctx) {
        const state = ctx.state;
        state.clock += 1;
        for (const piece of state.pieces) piece.x -= DEBRIS.drift;
        if (state.pieces.some((p) => p.x < 0)) state.pieces = state.pieces.filter((p) => p.x >= 0);
        if (state.clock < state.nextSpawn) return;
        state.nextSpawn = state.clock + DEBRIS.every + ctx.rng.below(DEBRIS.jitter + 1);
        const { width, height } = ctx.deps.grid.query.size();
        if (state.pieces.length >= DEBRIS.max || width === 0 || height === 0) return;
        // A band past a small map's bottom ends at its last row.
        const top = Math.min(DEBRIS.rows.top, height - 1);
        const bottom = Math.min(DEBRIS.rows.bottom, height - 1);
        const row = top + ctx.rng.below(bottom - top + 1);
        state.pieces.push({
          id: state.nextId,
          item: kindOf(ctx.rng),
          x: width * UNIT - 1,
          y: row * UNIT + UNIT / 2,
        });
        state.nextId += 1;
      },
    },
  ],
});

export type DebrisModule = typeof debrisModule;
export const debris = withFuzz(debrisModule, fuzzDebris);
