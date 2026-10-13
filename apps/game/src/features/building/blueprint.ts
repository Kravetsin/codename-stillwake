import type { Placement } from '@stillwake/sim';
import { Sprite, type Container } from 'pixi.js';
import { placementPicture } from '../../render/blueprint-art';
import { thumbnailOf, type Piece } from '../../render/pixel-art';
import { plugTexture } from '../../render/power-art';
import { SIDE } from '../../render/ship-art';
import type { Tool } from './tools';

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
  if (tool.kind === 'cable') {
    return thumbnailOf('card:cable', [{ texture: plugTexture(), x: 0, y: 0 }]);
  }
  return placementPicture(tool.placement);
}
