import { MATERIALS } from '@stillwake/content';
import type { Placement } from '@stillwake/sim';
import { Sprite, type Container } from 'pixi.js';
import { CELL } from '../../render/camera';
import { thumbnailOf, type Piece } from '../../render/pixel-art';
import { plugTexture } from '../../render/power-art';
import {
  backTexture,
  doorTexture,
  floorTexture,
  ladderTexture,
  machineTexture,
  pipeTexture,
  SIDE,
  valveTexture,
  wallEdgeTexture,
  wallTexture,
} from '../../render/ship-art';
import type { Tool } from './tools';

/** Every side of a cell, `SIDE`'s bits: a wall planned alone is outlined all round. */
const ALL_SIDES = SIDE.up | SIDE.right | SIDE.down | SIDE.left;

/**
 * The pictures `placement` at `cell` is drawn with, as the ship draws it built: `linked` (`SIDE`'s
 * bits) are the sides a pipe reaches toward and a door joins on. A machine is one picture from its
 * corner.
 */
export function piecesOf(
  placement: Placement,
  cell: number,
  width: number,
  linked: number,
): Piece[] {
  const col = cell % width;
  const row = Math.floor(cell / width);
  const x = col * CELL;
  const y = row * CELL;
  switch (placement.kind) {
    case 'wall': {
      const code = MATERIALS[placement.material].code;
      return [
        { texture: wallTexture(code, col, row), x, y },
        { texture: wallEdgeTexture(code, ALL_SIDES), x, y },
      ];
    }
    case 'backWall':
      return [{ texture: backTexture(MATERIALS[placement.material].code, col, row), x, y }];
    case 'floor':
      return [{ texture: floorTexture(), x, y }];
    case 'ladder':
      return [{ texture: ladderTexture(), x, y }];
    case 'door':
      return [{ texture: doorTexture(true, linked & (SIDE.up | SIDE.down)), x, y }];
    case 'pipe':
      return [{ texture: pipeTexture(linked), x, y }];
    case 'valve':
      return [
        { texture: pipeTexture(linked), x, y },
        { texture: valveTexture(true), x: x + CELL / 2 - 5, y: y + CELL / 2 - 5 },
      ];
    default:
      return [{ texture: machineTexture(placement.kind), x, y }];
  }
}

/**
 * The sides of `cell` whose neighbour `joins`, as `SIDE`'s bits: where a planned pipe reaches and a
 * planned door joins.
 */
export function linksOf(cell: number, width: number, joins: (cell: number) => boolean): number {
  const col = cell % width;
  let sides = 0;
  if (joins(cell - width)) sides |= SIDE.up;
  if (col < width - 1 && joins(cell + 1)) sides |= SIDE.right;
  if (joins(cell + width)) sides |= SIDE.down;
  if (col > 0 && joins(cell - 1)) sides |= SIDE.left;
  return sides;
}

/** Whether two placements join when drawn side by side: pipes and valves, or doors. */
export function joins(a: Placement, b: Placement): boolean {
  return a.layer === 'conduit' ? b.layer === 'conduit' : a.kind === 'door' && b.kind === 'door';
}

/**
 * Sprites laid into a container, reused from one drawing to the next: a ghost is drawn every frame,
 * and making sprites anew each time would be waste.
 */
export function createSprites(into: Container) {
  const pool: Sprite[] = [];
  let used = 0;
  return {
    /** Starts a drawing: every sprite laid before is hidden until laid again. */
    begin() {
      for (let i = 0; i < used; i++) {
        const s = pool[i];
        if (s) s.visible = false;
      }
      used = 0;
    },
    /** Lays `piece` tinted `tint` at `alpha`. */
    lay(piece: Piece, tint: number, alpha: number) {
      let s = pool[used];
      if (!s) {
        s = new Sprite();
        pool.push(s);
        into.addChild(s);
      }
      used += 1;
      s.texture = piece.texture;
      s.position.set(piece.x, piece.y);
      s.tint = tint;
      s.alpha = alpha;
      s.visible = true;
    },
  };
}

/** A card's picture in the build menu: what it builds, as the ship draws it; the cable its plug. */
export function thumbOf(tool: Tool): string {
  if (tool.kind === 'cable')
    return thumbnailOf('card:cable', [{ texture: plugTexture(), x: 0, y: 0 }]);
  const linked = tool.placement.layer === 'conduit' ? SIDE.left | SIDE.right : 0;
  return thumbnailOf(`card:${tool.id}`, piecesOf(tool.placement, 0, 1, linked));
}
