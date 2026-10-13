import { MATERIALS } from '@stillwake/content';
import type { Placement } from '@stillwake/sim';
import { CELL } from './camera';
import { thumbnailOf, type Piece } from './pixel-art';
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
} from './ship-art';

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
 * What `placement` builds, as a picture for a page: a build menu card's, a blueprint just learned;
 * a pipe or a valve reaching both ways.
 */
export function placementPicture(placement: Placement): string {
  const linked = placement.layer === 'conduit' ? SIDE.left | SIDE.right : 0;
  const id = 'material' in placement ? `${placement.kind}:${placement.material}` : placement.kind;
  return thumbnailOf(`placement:${id}`, piecesOf(placement, 0, 1, linked));
}
