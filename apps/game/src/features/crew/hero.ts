import { HERO } from '@stillwake/content';
import { STRUCTURE } from '@stillwake/sim';

/** Thousandths of a cell: the unit of every length and speed in `HERO`. */
export const UNIT = 1000;
/** The controller steps 60 times a second, whatever the frame rate. */
export const STEP_MS = 1000 / 60;

const HALF = HERO.width / 2;

/** The cells the hero moves against, as the grid's `layers` query hands them out. */
export interface Ship {
  readonly width: number;
  readonly height: number;
  readonly structure: readonly number[];
}

/** One hero's movement: `x` is the middle of the box and `y` its bottom, where the feet are. */
export interface Hero {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly climbing: boolean;
  readonly facing: -1 | 1;
}

/** What the player holds during one step; `y` is -1 for up. `jump` is set once per press. */
export interface Input {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
  readonly jump: boolean;
}

/** A hero standing on the bottom of `cell`, in the middle. */
export function heroAt(ship: Ship, cell: number): Hero {
  return {
    x: (cell % ship.width) * UNIT + UNIT / 2,
    y: (Math.floor(cell / ship.width) + 1) * UNIT,
    vx: 0,
    vy: 0,
    climbing: false,
    facing: 1,
  };
}

/**
 * One controller step. Walls, closed doors and the grid's edges block; floors and the tops of
 * ladders hold the hero up but let them through from below; ladders are climbed while held.
 */
export function stepHero(hero: Hero, input: Input, ship: Ship): Hero {
  const facing = input.x === 0 ? hero.facing : input.x;
  const grab =
    !hero.climbing &&
    input.y !== 0 &&
    input.x === 0 &&
    !input.jump &&
    touchesLadder(ship, hero.x, hero.y, input.y > 0);
  if (grab || hero.climbing) {
    if (input.x === 0 && !input.jump) {
      // A ladder centres the hero on it; narrower than a cell, the hero touches nothing beside it.
      return climb(ship, cellOf(hero.x) * UNIT + UNIT / 2, hero.y, input.y, facing);
    }
    // Walking or jumping lets go.
    return fall(ship, hero.x, hero.y, input.x, input.jump ? -HERO.jump : 0, facing);
  }
  const vy = input.jump && grounded(ship, hero.x, hero.y) ? -HERO.jump : hero.vy;
  return fall(ship, hero.x, hero.y, input.x, vy, facing);
}

function fall(ship: Ship, x: number, y: number, dir: number, vy: number, facing: -1 | 1): Hero {
  const speed = Math.min(vy + HERO.gravity, HERO.maxFall);
  const nx = moveX(ship, x, y, dir * HERO.walk);
  const ny = moveY(ship, nx, y, speed, false);
  return { x: nx, y: ny, vx: nx - x, vy: ny - y === speed ? speed : 0, climbing: false, facing };
}

function climb(ship: Ship, x: number, y: number, dir: number, facing: -1 | 1): Hero {
  const ny = moveY(ship, x, y, dir * HERO.climb, true);
  const column = cellOf(x);
  const before = cellOf(y - 1);
  const after = cellOf(ny - 1);
  if (after < before && climbable(ship, column, before) && !climbable(ship, column, after)) {
    // The feet rose past the ladder's top: the hero steps off and stands on it.
    return { x, y: before * UNIT, vx: 0, vy: 0, climbing: false, facing };
  }
  const still = touchesLadder(ship, x, ny, false);
  return { x, y: ny, vx: 0, vy: ny - y, climbing: still, facing };
}

function grounded(ship: Ship, x: number, y: number): boolean {
  return moveY(ship, x, y, 1, false) === y;
}

/** Whether the hero's column holds a ladder beside the body, or also just below the feet. */
function touchesLadder(ship: Ship, x: number, y: number, belowFeet: boolean): boolean {
  const column = cellOf(x);
  const last = cellOf(belowFeet ? y : y - 1);
  for (let row = cellOf(y - HERO.height); row <= last; row++) {
    if (climbable(ship, column, row)) return true;
  }
  return false;
}

/** `x` moved by `dx`, stopped flush against the first blocking column the leading edge enters. */
function moveX(ship: Ship, x: number, y: number, dx: number): number {
  const top = cellOf(y - HERO.height);
  const bottom = cellOf(y - 1);
  const blocked = (column: number) => {
    for (let row = top; row <= bottom; row++) if (solid(ship, column, row)) return true;
    return false;
  };
  if (dx > 0) {
    for (let c = cellOf(x + HALF - 1) + 1; c <= cellOf(x + HALF + dx - 1); c++) {
      if (blocked(c)) return c * UNIT - HALF;
    }
  } else if (dx < 0) {
    for (let c = cellOf(x - HALF) - 1; c >= cellOf(x - HALF + dx); c--) {
      if (blocked(c)) return (c + 1) * UNIT + HALF;
    }
  }
  return x + dx;
}

/**
 * `y` moved by `dy`, stopped flush against the first blocking row the leading edge enters. Going
 * down, floors block too, and ladder tops unless the hero climbs down through them. A row the feet
 * were already in is never entered, which is what lets a hero through a floor from below.
 */
function moveY(ship: Ship, x: number, y: number, dy: number, climbing: boolean): number {
  const left = cellOf(x - HALF);
  const right = cellOf(x + HALF - 1);
  const blocked = (row: number, down: boolean) => {
    for (let c = left; c <= right; c++) {
      if (solid(ship, c, row) || (down && holds(ship, c, row, climbing))) return true;
    }
    return false;
  };
  if (dy > 0) {
    for (let r = cellOf(y - 1) + 1; r <= cellOf(y + dy - 1); r++) {
      if (blocked(r, true)) return r * UNIT;
    }
  } else if (dy < 0) {
    const top = y - HERO.height;
    for (let r = cellOf(top) - 1; r >= cellOf(top + dy); r--) {
      if (blocked(r, false)) return (r + 1) * UNIT + HERO.height;
    }
  }
  return y + dy;
}

function cellOf(v: number): number {
  return Math.floor(v / UNIT);
}

function structureAt(ship: Ship, x: number, y: number): number | undefined {
  if (x < 0 || y < 0 || x >= ship.width || y >= ship.height) return undefined;
  return ship.structure[y * ship.width + x];
}

/** Walls, closed doors, and everything past the grid's edge. */
function solid(ship: Ship, x: number, y: number): boolean {
  const s = structureAt(ship, x, y);
  return s === undefined || s === STRUCTURE.wall || s === STRUCTURE.doorClosed;
}

/** Ladders, and an open door in line with one: a hatch the ladder climbs through. */
function climbable(ship: Ship, x: number, y: number): boolean {
  const s = structureAt(ship, x, y);
  if (s === STRUCTURE.ladder) return true;
  return (
    s === STRUCTURE.doorOpen &&
    (structureAt(ship, x, y - 1) === STRUCTURE.ladder ||
      structureAt(ship, x, y + 1) === STRUCTURE.ladder)
  );
}

/** What holds a hero up from below only: floors, and a ladder's top cell unless climbing. */
function holds(ship: Ship, x: number, y: number, climbing: boolean): boolean {
  if (structureAt(ship, x, y) === STRUCTURE.floor) return true;
  return !climbing && climbable(ship, x, y) && !climbable(ship, x, y - 1);
}
