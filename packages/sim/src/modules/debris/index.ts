import { DEBRIS, type ItemId } from '@stillwake/content';
import { defineModule, refuse, withFuzz, type QueryApi } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { CrewModule } from '../crew';
import type { GridModule } from '../grid';
import type { ItemsModule } from '../items';
import type { RoomsModule } from '../rooms';
import { fuzzDebris } from './fuzz';

/**
 * One piece drifting past, its middle at `x`, `y` in thousandths of a cell, always on the grid. It
 * drifts left by `speed` a tick from `start` and is gone once `x` is below `end`.
 */
export interface Piece {
  id: number;
  item: ItemId;
  x: number;
  y: number;
  speed: number;
  start: number;
  end: number;
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

/** The columns and rows the hull spans: every cell with a structure in it. None for no hull. */
function hullOf(
  grid: QueryApi<GridModule>,
): { left: number; right: number; top: number; bottom: number } | undefined {
  const { width, structure } = grid.layers();
  const empty = grid.codes().structure.empty;
  let hull: { left: number; right: number; top: number; bottom: number } | undefined;
  for (let cell = 0; cell < structure.length; cell++) {
    if (structure[cell] === empty) continue;
    const x = cell % width;
    const y = Math.floor(cell / width);
    if (!hull) hull = { left: x, right: x, top: y, bottom: y };
    else {
      hull.left = Math.min(hull.left, x);
      hull.right = Math.max(hull.right, x);
      hull.bottom = y;
    }
  }
  return hull;
}

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
 * Why peer `peer` cannot grab piece `id`: it is gone, or the hero or the piece is not in space. A
 * full inventory is no reason: what does not fit floats where the hero is.
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
  return undefined;
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
        const hero = ctx.deps.crew.query.hero(ctx.from);
        if (!hero) throw new Error('debris.grab: applied with no hero');
        ctx.deps.items.op.giveOrDrop(ctx.from, { [piece.item]: 1 }, hero.cell);
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
        for (const piece of state.pieces) piece.x -= piece.speed;
        if (state.pieces.some((p) => p.x < p.end)) {
          state.pieces = state.pieces.filter((p) => p.x >= p.end);
        }
        if (state.clock < state.nextSpawn) return;
        state.nextSpawn = state.clock + DEBRIS.every + ctx.rng.below(DEBRIS.jitter + 1);
        if (state.pieces.length >= DEBRIS.max) return;
        // Found again on every beat, so a ship grown taller gets a taller stream.
        const hull = hullOf(ctx.deps.grid.query);
        if (!hull) return;
        const { width, height } = ctx.deps.grid.query.size();
        const top = Math.max(0, hull.top - DEBRIS.margin);
        const bottom = Math.min(height - 1, hull.bottom + DEBRIS.margin);
        const row = top + ctx.rng.below(bottom - top + 1);
        const item = kindOf(ctx.rng);
        const { min, max } = DEBRIS.drift;
        const speed = min + ctx.rng.below(max - min + 1);
        const start = Math.min(width - 1, hull.right + DEBRIS.lead) * UNIT + UNIT / 2;
        state.pieces.push({
          id: state.nextId,
          item,
          x: start,
          y: row * UNIT + UNIT / 2,
          speed,
          start,
          end: Math.max(0, hull.left - DEBRIS.lead) * UNIT,
        });
        state.nextId += 1;
      },
    },
  ],
});

export type DebrisModule = typeof debrisModule;
export const debris = withFuzz(debrisModule, fuzzDebris);
