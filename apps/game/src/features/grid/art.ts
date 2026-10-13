import { MATERIALS, type MachineKind, type MaterialId } from '@stillwake/content';
import { Rectangle, Texture } from 'pixi.js';
import { CELL } from '../../render/camera';
import { pixelTexture, shade, type Palette } from '../../render/pixel-art';

/**
 * The ship drawn as pixel art, a pixel of art a pixel of the world, a cell sixteen pixels across.
 * Floors, ladders, doors, back walls and pipes are tiles a cell each; walls are cut from their
 * material's picture where they stand; a machine is one picture over its whole footprint. A wall is
 * outlined on each side that faces no wall, so a hull reads as one solid shape.
 */

/**
 * Each wall material as one seamless picture several cells across, laid over the whole world: a wall's
 * cell shows the part of it under the cell, so walls side by side make one solid mass. Plain on
 * purpose, a few marks over an even colour, so a wall reads as solid against the busier back
 * walls; its edge, drawn over it, gives it its depth. `m` its own, `n` and `N` a plate of
 * another metal welded on, `l` sheen, `d` shade, `x` rivet, `r` and `R` rust.
 */
export const WALL: Record<MaterialId, readonly string[]> = {
  scrap: [
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmddddddddddddddddddmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmxmmmxmmmmmmmmmmmmmmmmmnnnnnnnnnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmdmmmdmmmmmmmmmmmmmmmmnxnnnnnnnnnnnnnnxnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmllllllllllllmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmddddddddddddddmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmnnnnnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmnxnnnnnnnnnnxnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnxnnnnnnnnnnnnnnxnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmnnnnnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmNNNNNNNNNNNNNNNNNNmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmnnnnnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmnxnnnnnnnnnnxnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmNNNNNNNNNNNNNNmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmddddddddddmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnxnnnnnnxnmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmrRmmmmmmmmmmmmmmmmllllllllmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmRmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnxnnnnnnxnmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmNNNNNNNNNNmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmxmmmxmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmllllllllllllllmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmdmmmdmmmmmmmmmmmmmmddddddddddmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnxnnnnnnxnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmNNNNNNNNNNmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmllllllllllmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmrRmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmxmmmxmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmRmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmdmmmdmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmrmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmxmmmxmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmdmmmdmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmllllllmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmddddddddddddmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnnnmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnxnnnnnnnnxnmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnnnmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmddddddddmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnnnmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnxnnnnnnnnxnmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmddddddddddddddddmmmmmmmmmmmmmmmmmmmmmmnxnnnnxnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmNNNNNNNNNNNNmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmnxnnnnnnnnnnnnxnmmmmmmmmmmmmmmmmmmmmmmNNNNNNNNmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnnnnnnnnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmnxnnnnnnnnnnnnxnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmNNNNNNNNNNNNNNNNmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmrRmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmRmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmrmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmllllllllllllmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmrRmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmlllllllllmmmmmmmmm',
    'mmmmmmmmmmRmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmrmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
  ],
  iron: [
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmxmmmxmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmdmmmdmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmxmmmxmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmdmmmdmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmlllmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmlllmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmxmmmxmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmdmmmdmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmlllmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmllmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmxmmmxmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmdmmmdmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
  ],
};

const MATERIAL_COLOUR: Record<MaterialId, number> = { scrap: 0x5b6170, iron: 0x8f99ad };
const RUST = { r: 0x8a5a3a, R: 0x6a4430 };

/** Back walls by material: darker than any wall, so walls stand out from them in any light (0019). */
const BACK_COLOUR: Record<MaterialId, number> = { scrap: 0x323640, iron: 0x2f3646 };

/**
 * The scrap back wall: sheets of every size, some corrugated, patched and welded, one seamless
 * picture cut where each back wall stands, as walls are. Drawn in `BACK_COLOUR`, darker than walls.
 */
const BACK_SCRAP = [
  'oooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo',
  'ollllllllllllllllllllllllllollllllllllllllllllllllllllllllllllllolllllllllllllllllllommmmmmmmmmmmmmmmmmmmmolllllllllllllllllllll',
  'olmmmmmmmmmmmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdlmmdlmmdlmmdlmmddolmmmmmmmmmmmmmmmmmdomnnRnnnnnnnnnnnnnnnnNolmdlmmdlmmdlmmdlmmdld',
  'olmxmmmxmmmxmmmxmmmxmmmxmmdolmdlmmdlmmdlmmdlmmdlmmdlmmdlmmdlmmddolmxmmmxmmmxmmmxmmmdomnxrnnnxnnnnxnnnnxnnNolmdlmmdlmmdlmmdlmmdld',
  'olmmmmmmmmmmmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdlmmdlmmdlooooooooolmmmmooooooooommmmdomnnrnnnnnnnnnnnnnnnnNolmdlmmdlmmdlmmdlmmdld',
  'olmmmmmmmmmmmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdlmmdlmmdlommmmmmmolmmmmommmmmmmommmmdomnnnnnnnnnnnnnnnnnnnNolmdlmmdlmmdlmmdlmmdld',
  'olmmmmoooooooooommmmmmmmmmdolmdlmmdlmmdlmmdlmmdlmmdlmmdlomnnnnnnolmmmmomnnnnnNommmmdomnnnnnnnnnnnnnnnnnnnNolmdlmmdlmmdlmmdlmmdld',
  'olmxmmommmmmmmmommmmmmmxmmdolmdlmmdlmmdlmmdlmmdlmmdlmmdlomnxnnnxolmxmmomnxnnnNomxmmdomnnnnnnnnnnnnnnnnnnnNolmdlmmdlmmdlmmdlmmdld',
  'olmmmmomnnnnnnNommmmmmmmmmdolmdlmmdlmmdlmmdlmmdlmmdlmmdlomnnnnnnolmmmmomnnnnnNommmmdomnxnnnnnnnnnnnnnnxnnNolmdlmmdlmmdlmmdlmmdld',
  'olmmmmomnxnnxnNommmmmmmmmmdolmdlmmdlmmdlmmdlmmdlmmdlmmdlomnnnnnnolmmmmoNNNNNNNommmmdomnnnnnnnnnnnnnnnnnnnNolmdlmmdlmmdlmmdlmmdld',
  'olmmmmomnxnnxnNommmmmmmmmmdolmdlmmdlmmdlmmdlmmdlmmdlmmdlomnxnnnxolmmmmooooooooommmmdomnnnnnnnnnnnnnnnnnnnNolmdlmmdlmmdlmmdlmmdld',
  'olmxmmomnnnnnnNommmmmmmxmmdolmdlmmdlmmdlmmdlmmdlmmdlmmdlomnnnnnnolmxmmmmmmRmmmmmxmmdomnnnnnnnnnnnnnnnnnnnNolmdlmmdlmmdlmmdlmmdld',
  'olmmmmoNNNNNNNNommmmmmmmmmdoddddddddddddddddddddddddddddoNNNNNNNolmmmmmmmmrmmmmmmmmdomnnnnnnnnnnnnnnnnnnnNolmdlmmdlmmdlmmdlmmdld',
  'olmmmmoooooooooommmmmmmmmmdoooooooooooooooooooooooooooooooooooooolmxmmmxmmrxmmmxmmmdomnxnnnnnnnnnnnnnnxnnNoddddddddddddddddddddd',
  'olmmmmmmmRmmmmmmmmmmmmmmmmdommmmmmmmmmmmmmmmmmmollllllllllllRlllolmmmmmmmmrmmmmmmmmdomnnnnnnnnnnnnnnnnnnnNoooooooooooooooooooooo',
  'olmxmmmmmrmmmmmmmmmmmmmxmmdomnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmrmmdolmmmmmmmmrmmmmmmmmdomnnnnnnnnnnnnnnnnnnnNolllllllllllllllllllll',
  'olmmmmmmmrmmmmmmmmmmmmmmmmdomnxnnnxnnnxnnnxnnnNolmxmmmxmmmxmrmmdodddddddddddddddddddomnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmd',
  'olmxmmmxmrmxmmmxmmmxmmmxmmdomnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmrmmdooooooooooooooooooooomnnnnnnnnnnnnnnnnnnnNolmxmmmmmxmmmmmxmmmmmd',
  'olmmmmmmmrmmmmmmmmmmmmmmmmdomnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmdolllllllllllllllllllomnxnnnnnnnnnnnnnnxnnNolmmmmmmmmmmmmmmmmmmmd',
  'olmmmmmmmmmmmmmmmmmmmmmmmmdomnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdomnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmd',
  'oddddddddddddddddddddddddddomnxnnnnnnnnnnnnxnnNolmxmmmmmmmmmxmmdolmdlmmdlmmdlmmdlmmdomnxnnnnxnnnnxnnnnxnnNolmmmmmmmmmmmmmmmmRmmd',
  'oooooooooooooooooooooooooooomRnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdomnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmrmmd',
  'ommmmmmmmmmmmmmolllllllllllomrnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdomnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmrmmd',
  'omnnnnnnnnnnnnNolmmmmmmmmmdomrnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdoNNNNNNNNNNNNNNNNNNNNNolmxmmmmmmmmmmmmmmrmmd',
  'omnxnnnnxnnnnnNolmxmmmxmmmdomnxnnnnnnnnnnnnxnnNolmxmmmmmmmmmxmmdolmdlmmdlmmdlmmdlmmdooooooooooooooooooooooolmmmmmmmmmmmmmmmmrmmd',
  'omnnnnnnnnnnnnNolmmmmmmmmmdomnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdolllllllllllllllllllllolmmmmmmmmmmmmmmmmrmmd',
  'omnnnnnnnnnnnnNolmmmmmmmmmdomnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmmmmmmmmmmdolmmmmmmmmmmmmmmmmmmmd',
  'omnnnnnnnnnnnnNolmmmmmmmmmdomnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdolmxmmmxmmmxmmmxmmmmmdolmmmmmmmmmmmmmmmmmmmd',
  'omnnnnnnnnnnnnNolmxmmmmxmmdomnxnnnnnnnnnnnnxnnNolmxmmmmmmmmmxmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmmmmmmmmmmdolmmmmmmmmmmmmmmmmmmmd',
  'omnxnnnnnnnxnnNolmmmmmmmmmdomnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmmmmmmmmmmdolmxmmmmmmmmmmmmmmxmmd',
  'omnnnnnnnnnnnnNolmmmmmmmmmdomnnnnnnnnnnnoooooooooooooommmmmmmmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmooooooooooolmxmmmmmxmmmmmxmmmmmd',
  'omnnnnnnnnnnnnNolmmmmmmmmmdomnxnnnxnnnxnollllllllllllommmmmmmmmdolmdlmmdlmmdlmmdlmmdolmxmmmmmmmmolllllllllolmmmmmmmmmmmmmmmmmmmd',
  'omnnnnnnnnnnnnNolmxmmmxmmmdomnnnnnnnnnnnolmmmmmmmmmmdommmmmmxmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmolmmmmmmmdolmmmmmmmmmmmmmmmmmmmd',
  'omnnnnnnnnnnnnNolmmmmmmmmmdomnnnnnnnnnnnolmxmmmmxmmmdommmmmmmmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmolmxmmmxmdoddddddddddddddddddddd',
  'omnxnnnnnnnxnnNolmmmmmmmmmdoNNNNNNNNNNNNolmmmmmmmmmmdommmmmmmmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmolmmmmmmmdoooooooooooooooooooooo',
  'omnnnnnnnnnnnnNodddddddddddmmmmooooRooooolmmmmmmmmmmdommmmmmmmmdolmdlmmdlmmdlmmdlmmdolmxmmmmmmmmolmxmmmxmdommmmmmmmmmmmmmmmmmmmm',
  'omnnnnnnnnnnnnNmoommmmmmmmmmmmmolllrllllolmxmmmmxmmmdommmmmmxmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmolmmmmmmmdomnnnnnnnnnnnnnnnnnnnN',
  'omnnRnnnnnnnnnNmlloommmmmmmmmmmolmmrmmmmolmmmmmmmmmmdommmmmmmmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmodddddddddomnxnnnxnnnxnnnxnnnnnN',
  'omnnrnnnnnnnnnNmmmlloommmmmmmmmolmxrmmmmoddddddddddddommmmmmmmmdolmdlmmdlmmdlmmdlmmdolmxmmmxmmmxooooooooooomnxnnnxnnnxnnnxnnnnnN',
  'omnxrnnnnnnxnnNmmmmmlloommmmmmmolmmrmmmmoooooooooooooommmmmmmmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmmmmmRmmmmdomnnnnnnnnnnnnnnnnnnnN',
  'omnnrnnnnnnnnnNmmmmmmmlloommmmmolmmrmmmmmmmmmmdolmxmRmxmmmxmmmmdolmdlmmdlmmdlmmdlmmdolmmmmmmmmmmmmmmrmmmmdomnnnnnnnnnnnnnnnnnnnN',
  'omnnrnnnnnnnnnNmmmmmmmmmllmmmmmolmmmmmmmmmmmmmdolmmmrmmmmmmmmmmdodddddddddddddddddddodddddddddddddddrdddddoNNNNNNNNNNNNNNNNNNNNN',
  'omnnrnnnnnnnnnNmmmmmmmmmmmmmmmmolmmmmmmmmmmmmmdolmmmrmmmmmmmmmmdoooooooooooooooooooooooooooooooooooorooooooooooooooooooooooooooo',
  'omnxrnnnxnnnnnNmmmmmmmmmmmmmmmmolmmmmmmmmmmmmmdoddddddddddddddddommmmmmmmmmmmmmmmmmmmmmmmmolllllllllllllllllllllllllllllllllllll',
  'omnnnnnnnnnnnnNmmmmmmmmmmmmmmmmolmxmmmmmmmmxmmdoooooooooooooooooomnnnnnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmd',
  'omnnnnnnnnnnnnNmmmmmmmmmmmmmmmmolmmmmmmmmmmmmmdommmmmmmmmmmmmmmmomnxnnnxnnnxnnnxnnnxnnnnnNolmxmmmmxmmmmxmmmmxmmmmxmmmmxmmmmxmmmd',
  'oNNNNNNNNNNNNNNmmmmmmmmmmmmmmmmolmmmmmmmmmmmmmdomnnnnnnnnnnnnnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmd',
  'oooooooooooooooooooooooooooooooolmmmmmmmmmmmmmdomnxnnnxnnnxnnnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmd',
  'ollllllllllllllllllllllllllllllolmmmmmmmmmmmmmdomnnnnnnnnnnnnnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmmoooooooooommmmmd',
  'olmdlmmdlmmdlmmdlmmdlmmdlmmdlmdolmmmmmmmmmmmmmdomnnnnnnnnnnnnnnNomnxnnnnnnnnnnnnnnnnnnxnnNolmmmmmmmmmmmmmmmmmmmmommmmmmmmommmmmd',
  'olmdlmmdlmmdlmmdlmmdlmmdlmmdlmdolmxmmmmmmmmxmmdomnnnnnnnnnnnnnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmxmmmmmmmmmmmmmmmmmmomnnnnnnNommxmmd',
  'olmdlmmdlmmdlmmdlmmdlmmdlmmdlmdolmmmmmmmmmmmmmdomnxnnnnnnnnnxnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmmomnxnnxnNommmmmd',
  'olmdlmmdlmmdlmmdlmmdooooooooomdolmmmmmmmmmmmmmdomnnnnnnnnnnnnnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmmomnnnnnnNommmmmd',
  'olmdlmmdlmmdlmmdlmmdommmmmmmomdolmmmmmmmmmmmmmdomnnnnnnnnnnnnnnNomnxnnnnnnnnnnnnnnnnnnxnnNolmmmmmmmmmmmmmmmmmmmmomnxnnxnNommmmmd',
  'olmdlmmdlmmdlmmdlmmdomnnnnnNomdolmmmmmmmmmmmmmdomnnnnnnnnnnnnnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmmomnnnnnnNommmmmd',
  'olmdlmmdlmmdlmmdlmmdomnxnnnNomdolmmmmmmmmmmmmmdomnxnnnnnnnnnxnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmxmmmmmmmmmooommmmmmoNNNNNNNNommxmmd',
  'olmdlmmdlmmdlmmdlmmdomnnnnnNomdolmxmmmmmmmmxmmdomnnnnnnnnnnnnnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmmmmmmmooolllmmmmmmoooooooooommmmmd',
  'olmdlmmdlmmdlmmdlmmdoNNNNNNNomdolmmmmmmmmmmmmmdomnnnnnnnnnnnnnnNomnxnnnnnnnnnnnnnnnnnnxnnNolmmmmmooolllmmmmmmmmmmmmmmRmmmmmmmmmd',
  'olmdlmmdlmmdlmmdlmmdooooooooomdolmmmmmmmmmmmmmdomnnnnnnnnnnnnnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmooolllmmmmmmmmmmmmmmmmmrmmmmmmmmmd',
  'olmdlmmdlmmdlmmdlmmdlmRdlmmdlmdolmmmmmmmmmmmmmdomnxnnnnnnnnnxnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmlllmmmmmmmmmmmmmmmmmmmmrmmmmmmmmmd',
  'olmdlmmdlmmdlmmdlmmdlmrdlmmdlmdolmxmmmmmxmmmmmdomnxnnnxnnnxnnnnNomnxnnnxnnnxnnnxnnnxnnnnnNolmxmmmmxmmmmxmmmmxmmmmxmmmrxmmmmxmmmd',
  'olmdlmmdlmmdlmmdlmmdlmrdlmmdlmdolmmmmmmmmmmmmmdomnnnnnnnnnnnnnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmmmmmmmrmmmmmmmmmd',
  'olmdlmmdlmmdlmmdlmmdlmrdlmmdlmdolmmmmmmmmmmmmmdomnnnnnnnnnnnnnnNomnnnnnnnnnnnnnnnnnnnnnnnNolmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmd',
  'oddddddddddddddddddddddddddddddodddddddddddddddoNNNNNNNNNNNNNNNNoNNNNNNNNNNNNNNNNNNNNNNNNNoddddddddddddddddddddddddddddddddddddd',
];

/** The iron back wall's panels; one in every few has a grille, so a long wall does not repeat. */
const BACK_IRON = {
  plain: [
    'lllllllllllllllo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'ldddddddddddddoo',
    'oooooooooooooooo',
  ],
  grille: [
    'lllllllllllllllo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmoooooooommdo',
    'lmmmddddddddmmdo',
    'lmmmoooooooommdo',
    'lmmmddddddddmmdo',
    'lmmmoooooooommdo',
    'lmmmddddddddmmdo',
    'lmmmoooooooommdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'lmmmmmmmmmmmmmdo',
    'ldddddddddddddoo',
    'oooooooooooooooo',
  ],
};

/** A catwalk along the top of its cell. */
const FLOOR = ['llllllllllllllll', 'mmmmmmmmmmmmmmmm', 'dodddodddodddodd', 'oooooooooooooooo'];

const LADDER = [
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....llllll.....',
  '.....dddddd.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....llllll.....',
  '.....dddddd.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
  '.....ld..ld.....',
];

/** A door shut, with a window and hazard stripes, and open, slid up into its frame. */
const DOOR = {
  closed: [
    '...oooooooooo...',
    '...olllllllmo...',
    '...olmmmmmmdo...',
    '...olmkkkkmdo...',
    '...olmkggkmdo...',
    '...olmkgkkmdo...',
    '...olmkkkkmdo...',
    '...olmmmmmmdo...',
    '...olmmmmmmdo...',
    '...oddddddddo...',
    '...olmmmmmmdo...',
    '...olmmmmmmdo...',
    '...oyykkyykko...',
    '...oykkyykkyo...',
    '...okkyykkyyo...',
    '...oooooooooo...',
  ],
  open: [
    '...oooooooooo...',
    '...oyykkyykko...',
    '...oooooooooo...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...o........o...',
    '...oo......oo...',
  ],
};

/** A valve's wheel, ten pixels across, in its state's colour `c`. */
const VALVE = [
  '...OOOO...',
  '..OccccO..',
  '.OcOOOOcO.',
  'OcO.cc.OcO',
  'OcOcOOcOcO',
  'OcOcOOcOcO',
  'OcO.cc.OcO',
  '.OcOOOOcO.',
  '..OccccO..',
  '...OOOO...',
];

const PIPE = 0x56606e;
const VALVE_COLOUR = { open: 0x4caf6a, closed: 0xd05050 };

/** Colours shared by every machine. */
export const GEAR: Palette = {
  K: 0x1a1e25,
  k: 0x2a3d4f,
  n: 0x3a536a,
  e: 0x5f86a8,
  h: 0x9fbfda,
  c: 0x9fd8ff,
  s: 0x10161d,
  P: 0xd8e6f2,
  w: 0xe8f2ff,
  y: 0xe8c547,
  z: 0x2a2f3a,
  q: 0x4f8fa0,
  Q: 0x356a78,
  p: 0x86c3d1,
  f: 0x6b4a3a,
  F: 0x4a3226,
  r: 0x3a1a12,
  R: 0x5a2a18,
  g: 0x22262c,
  b: 0x24477f,
  B: 0x4f7fc8,
  u: 0xfff1c8,
};

/** Each machine over its whole footprint, a cell sixteen pixels. */
export const MACHINE_ART: Record<MachineKind, readonly string[]> = {
  tank: [
    '................................',
    '.........KKKKKKKKKKKKKK.........',
    '......KKqppqqqqqqqqqqQQQKK......',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KeeeeeeeeeeeeeeennnnnK.....',
    '.....KKKKKKKKKKKKKKKKKKKKKK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqKKKKKKqqQQQQQK.....',
    '.....KqqppqqqKhhhhKqqQQQQQK.....',
    '.....KqqppqqqKwwKwKqqQQQQQK.....',
    '.....KqqppqqqKwKwwKqqQQQQQK.....',
    '.....KqqppqqqKwwwwKqqQQQQQK.....',
    '.....KqqppqqqKKKKKKqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KeeeeeeeeeeeeeeennnnnK.....',
    '.....KKKKKKKKKKKKKKKKKKKKKK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '.....KqqppqqqqqqqqqqqQQQQQK.....',
    '...KKKKKKKKKKKKKKKKKKKKKKKKKK...',
    '...KeeeeeeeeeeeeeeeeeeeeeeeeK...',
    '...KkkkkkkkkkkkkkkkkkkkkkkkkK...',
    '...KKKKKKKKKKKKKKKKKKKKKKKKKK...',
  ],
  generator: [
    '.....KnnK..............KnnK.....',
    '.....KnnK..............KnnK.....',
    '.....KnnK..............KnnK.....',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
    '.KeeeeeeeeeeeeeeeeeeeeeeeeeeeeK.',
    '.KennnnnKKKKKKnnnnnnnnnnnnnnnkK.',
    '.KennnKKeeeeeeKKnnnnnKKKKKKKnkK.',
    '.KennKKcekkkkecKKnnnnkkkkkkknkK.',
    '.KenKKekckkkkckeKKnnnnnnnnnnnkK.',
    '.KenKekkcckkcckkeKnnnKKKKKKKnkK.',
    '.KeKeekkkckkckkkeeKnnkkkkkkknkK.',
    '.KeKekkkkhhhhkkkkeKnnnnnnnnnnkK.',
    '.KeKekkkkhKKhkkkkeKnnKKKKKKKnkK.',
    '.KeKecccchKKhkccccKnnkkkkkkknkK.',
    '.KeKekkkkhhhhkkkkeKnnnnnnnnnnkK.',
    '.KeKeekkkckkckkkeeKnnKKKKKKKnkK.',
    '.KenKekkcckkcckkeKnnnkkkkkkknkK.',
    '.KenKKekckkkkckeKKnnnnnnnnnnnkK.',
    '.KennKKeckkkkecKKnnnnKKKKKKKnkK.',
    '.KennnKKeeeeeeKKnnnnnkkkkkkknkK.',
    '.KennnnnKKKKKKnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnnnnnnnnnnnnnnnnkK.',
    '.KennnnnnnnnnnzzyyzzyyzzyyzznkK.',
    '.KennnnnnnnnnnzzyyzzyyzzyyzznkK.',
    '.KkkkkkkkkkkkkkkkkkkkkkkkkkkkkK.',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
    '..KKKK....................KKKK..',
    '..KKKK....................KKKK..',
  ],
  furnace: [
    '....................KennnkK.....',
    '....................KennnkK.....',
    '....................KennnkK.....',
    '....................KennnkK.....',
    '....................KennnkK.....',
    '....................KennnkK.....',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
    '.KeeeeeeeeeeeeeeeeeeeeeeeeeeeeK.',
    '.KFfffffFfffffFfffffFfffffFfffK.',
    '.KFfffffFfffffFfffffFfffffFfffK.',
    '.KFFFFFFFFFFFFFFFFFFFFFFFFFFFFK.',
    '.KfffFfffffFfffffFfffffFfffffFK.',
    '.KfffFfffffFfffffFfffffFfffffFK.',
    '.KfffFfffffFfffffFfffffFfffffFK.',
    '.KFFFFFFFFFFFFFFFFFFFFFFFFFFFFK.',
    '.KFfffffFfffffFfffffFfffffFfffK.',
    '.KFfffffFffffKKKKKKKKKKKKfFfffK.',
    '.KFfffffFffffKRRRRRRRRRRKfFfffK.',
    '.KFFFFFFFFFFFKRRRRRRRRRRKFFFFFK.',
    '.KfffFfffffFfKrrrrrrrrrrKffffFK.',
    '.KfffFfffffFfKrrrrrrrrrrKffffFK.',
    '.KfffFfffffFfKggggggggggKffffFK.',
    '.KFFFFFFFFFFFKrgrgrgrgrgKFFFFFK.',
    '.KFfffffFffffKrgrgrgrgrgKfFfffK.',
    '.KFfffffFffffKrgrgrgrgrgKfFfffK.',
    '.KFfffffFffffKrgrgrgrgrgKfFfffK.',
    '.KFFFFFFFFFFFKrgrgrgrgrgKFFFFFK.',
    '.KfffFfffffFfKrgrgrgrgrgKffffFK.',
    '.KfffFfffffFKKKKKKKKKKKKKKfffFK.',
    '.KfffFfffffFnnnnnnnnnnnnnnfffFK.',
    '.KFFFFFFFFFFnnnnnnnnnnnnnnFFFFK.',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
  ],
  solarPanel: [
    '................................................',
    '................................................',
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeK',
    'KBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbK',
    'KBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbK',
    'KbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbK',
    'KbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbK',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    'KBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbbKBBbbK',
    'KBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbbKBbbbK',
    'KbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbK',
    'KbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbbKbbbbK',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    '......................KnnK......................',
    '......................KnnK......................',
    '......................KnnK......................',
  ],
  vent: [
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KeeeeeeeeeeeeK.',
    '.KeKKKKKKKKKKkK.',
    '.KennnnnnnnnnkK.',
    '.KeKKKKKKKKKKkK.',
    '.KennnnnnnnnnkK.',
    '.KeKKKKKKKKKKkK.',
    '.KennnnnnnnnnkK.',
    '.KeKKKKKKKKKKkK.',
    '.KennnnnnnnnnkK.',
    '.KeKKKKKKKKKKkK.',
    '.KennnnnnnnnnkK.',
    '.KkkkkkkkkkkkkK.',
    '.KKKKKKKKKKKKKK.',
    '................',
  ],
  crate: [
    '................................',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    'KyyyeeeeeeeeeeeKKeeeeeeeeeeeyyyK',
    'KyyykkkkkkkkkkkKKkkkkkkkkkkkyyyK',
    'KekknkkkkkkkkkkKKkkkkkkkkkknkkkK',
    'KekkknkkkkkkkkkKKkkkkkkkkknkkkkK',
    'KekkkknkkkkkkKKKKKKkkkkkknkkkkkK',
    'KekkkkknkkkkkKyyyyKkkkkknkkkkkkK',
    'KekkkkkknkkkkKyyyyKkkkknkkkkkkkK',
    'KekkkkkkknkkkKKKKKKkkknkkkkkkkkK',
    'KekkkkkkkknkkkkKKkkkknkkkkkkkkkK',
    'KekkkkkkkkknkkkKKkkknkkkkkkkkkkK',
    'KekkkkkkkkkknkkKKkknkkkkkkkkkkkK',
    'KekkkkkkkkkkknkKKknkkkkkkkkkkkkK',
    'KkkkkkkkkkkkkkkKKkkkkkkkkkkkkkkK',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  ],
  lamp: [
    '...KeeeeeeeeK...',
    '...KeeeeeeeeK...',
    '...KKKKKKKKKK...',
    '.......KK.......',
    '.......KK.......',
    '.......KK.......',
    '.....KKKKKK.....',
    '.....KuuuuK.....',
    '....KuuwuuuK....',
    '....KuwwuuuK....',
    '....KuuuuuuK....',
    '.....KuuuuK.....',
    '.....KKKKKK.....',
    '................',
    '................',
    '................',
  ],
};

const DOOR_COLOUR = 0xc97a3a;
const LADDER_COLOUR = 0xb08d57;
const FLOOR_COLOUR = 0x9aa3b5;

/** The plain shades of `colour` a tile is drawn in. */
function shadesOf(colour: number): Palette {
  return { l: shade(colour, -0.22), m: colour, d: shade(colour, 0.78), o: shade(colour, 0.55) };
}

const MATERIAL_BY_CODE = new Map<number, MaterialId>(
  (Object.keys(MATERIALS) as MaterialId[]).map((id) => [MATERIALS[id].code, id]),
);

/**
 * `make` kept by a number: a chunk asks for a tile hundreds of times as it is drawn, and a string key
 * for each ask cost as much as drawing.
 */
function keptBy(make: (n: number) => Texture): (n: number) => Texture {
  const kept: Texture[] = [];
  return (n) => (kept[n] ??= make(n));
}

/** Which sides of a wall face no wall: up, right, down, left, a bit each. */
export const SIDE = { up: 1, right: 2, down: 4, left: 8 } as const;

/**
 * The edge drawn over a wall's cell on each side in `open`: an outline, and inside it a bevel lit
 * along the top and left and shaded along the bottom and right, so a wall stands out as a solid block.
 */
function edgeRows(open: number): string[] {
  const last = CELL - 1;
  const up = (open & SIDE.up) !== 0;
  const down = (open & SIDE.down) !== 0;
  const left = (open & SIDE.left) !== 0;
  const right = (open & SIDE.right) !== 0;
  return Array.from({ length: CELL }, (_, y) =>
    Array.from({ length: CELL }, (_, x) => {
      if ((up && y === 0) || (down && y === last) || (left && x === 0) || (right && x === last))
        return 'O';
      // Where two outlined sides meet, the corner is cut.
      const cut =
        (up && left && x + y === 1) ||
        (up && right && last - x + y === 1) ||
        (down && left && x + last - y === 1) ||
        (down && right && 2 * last - x - y === 1);
      if (cut) return 'O';
      if ((up && y === 1) || (left && x === 1)) return 'L';
      if ((down && y === last - 1) || (right && x === last - 1)) return 'D';
      if (up && y === 2) return 'H';
      if (down && y === last - 2) return 'E';
      return '.';
    }).join(''),
  );
}

/** A number for `cell` that looks random, the same every time: which look a tile takes there. */
function hashOf(cell: number): number {
  let h = Math.imul(cell ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function materialOf(code: number): MaterialId {
  return MATERIAL_BY_CODE.get(code) ?? 'scrap';
}

const patterns = keptBy((code) => {
  const id = materialOf(code);
  const colour = MATERIAL_COLOUR[id];
  return pixelTexture(`wall:${id}`, WALL[id], {
    ...shadesOf(colour),
    x: shade(colour, -0.45),
    n: shade(colour, 0.84),
    N: shade(colour, 0.7),
    ...RUST,
  });
});

/** The cell at column `x` and row `y` of the grid cut from `picture`, laid over the world from its corner. */
function cut(picture: Texture, x: number, y: number): Texture {
  const across = picture.width / CELL;
  const piece = (y % (picture.height / CELL)) * across + (x % across);
  let pieces = cuts.get(picture);
  if (!pieces) cuts.set(picture, (pieces = []));
  return (pieces[piece] ??= new Texture({
    source: picture.source,
    frame: new Rectangle((piece % across) * CELL, Math.floor(piece / across) * CELL, CELL, CELL),
  }));
}

const cuts = new Map<Texture, Texture[]>();

/** The wall at column `x` and row `y` of the grid, of the material coded `code` (scrap for a code unknown). */
export function wallTexture(code: number, x: number, y: number): Texture {
  return cut(patterns(code), x, y);
}

/** The outline over a wall of the material coded `code` on the `open` sides, which use `SIDE`'s bits. */
export function wallEdgeTexture(code: number, open: number): Texture {
  return edges(code * 16 + open);
}

const edges = keptBy((n) => {
  const id = materialOf(Math.floor(n / 16));
  const colour = MATERIAL_COLOUR[id];
  return pixelTexture(`wall-edge:${id}:${n % 16}`, edgeRows(n % 16), {
    O: shade(colour, 0.3),
    L: shade(colour, -0.4),
    H: shade(colour, -0.18),
    D: shade(colour, 0.62),
    E: shade(colour, 0.82),
  });
});

/**
 * The back wall at column `x` and row `y` of the grid, of the material coded `code`: scrap cut from
 * its picture, iron a panel, a grille in about one cell of seven.
 */
export function backTexture(code: number, x: number, y: number): Texture {
  if (materialOf(code) === 'scrap') return cut(scrapBack(0), x, y);
  return ironBacks(hashOf((y << 16) | x) % 7 === 0 ? 1 : 0);
}

const scrapBack = keptBy(() => {
  const colour = BACK_COLOUR.scrap;
  return pixelTexture('back:scrap', BACK_SCRAP, {
    l: shade(colour, -0.1),
    m: colour,
    d: shade(colour, 0.8),
    o: shade(colour, 0.6),
    x: shade(colour, -0.18),
    n: shade(colour, 0.86),
    N: shade(colour, 0.74),
    r: 0x5a3c2a,
    R: 0x46301f,
  });
});

const ironBacks = keptBy((grille) => {
  const look = grille ? 'grille' : 'plain';
  return pixelTexture(`back:iron:${look}`, BACK_IRON[look], shadesOf(BACK_COLOUR.iron));
});

export function floorTexture(): Texture {
  return pixelTexture('floor', FLOOR, shadesOf(FLOOR_COLOUR));
}

export function ladderTexture(): Texture {
  return pixelTexture('ladder', LADDER, shadesOf(LADDER_COLOUR));
}

/**
 * A door's cell, joined to the door's cells above and below in `linked` (`SIDE`'s bits): a door
 * several cells tall is one door, its frame and window at the top, its stripes at the bottom.
 */
export function doorTexture(closed: boolean, linked: number): Texture {
  return doors((closed ? 16 : 0) + linked);
}

const doors = keptBy((n) => {
  const closed = n >= 16;
  const linked = n % 16;
  const look = closed ? 'closed' : 'open';
  const rows = [...DOOR[look]];
  const plain = closed ? '...olmmmmmmdo...' : '...o........o...';
  const clear = (from: number, to: number) => rows.fill(plain, from, to);
  if (linked & SIDE.up) clear(0, closed ? 7 : 3);
  if (linked & SIDE.down) clear(closed ? 12 : 15, 16);
  return pixelTexture(`door:${look}:${linked}`, rows, {
    ...shadesOf(DOOR_COLOUR),
    o: shade(DOOR_COLOUR, 0.4),
    k: GEAR.z ?? 0,
    g: 0x8fb6d6,
    y: GEAR.y ?? 0,
  });
});

/** A pipe's tile reaching toward the sides in `linked`, which use `SIDE`'s bits. */
export function pipeTexture(linked: number): Texture {
  return pipes(linked);
}

const pipes = keptBy((linked) => {
  const grid = Array.from({ length: 16 }, () => [...'................']);
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j]![i] = c;
  };
  // Four pixels across, lit along the top or left: outline, light, shade, outline.
  const across = (x: number, w: number) => {
    rect(x, 6, w, 1, 'o');
    rect(x, 7, w, 1, 'l');
    rect(x, 8, w, 1, 'd');
    rect(x, 9, w, 1, 'o');
  };
  const down = (y: number, h: number) => {
    rect(6, y, 1, h, 'o');
    rect(7, y, 1, h, 'l');
    rect(8, y, 1, h, 'd');
    rect(9, y, 1, h, 'o');
  };
  if (linked & SIDE.left) across(0, 8);
  if (linked & SIDE.right) across(8, 8);
  if (linked & SIDE.up) down(0, 8);
  if (linked & SIDE.down) down(8, 8);
  // A flange where the runs meet.
  rect(5, 5, 6, 6, 'o');
  rect(6, 6, 4, 4, 'm');
  rect(6, 6, 4, 1, 'l');
  const rows = grid.map((row) => row.join(''));
  return pixelTexture(`pipe:${linked}`, rows, shadesOf(PIPE));
});

export function valveTexture(open: boolean): Texture {
  const colour = open ? VALVE_COLOUR.open : VALVE_COLOUR.closed;
  return pixelTexture(`valve:${open}`, VALVE, { c: colour, O: shade(colour, 0.35) });
}

/** A machine's power socket, where a cable plugs in (`plug` in `MACHINES`), five pixels across. */
const SOCKET = ['.KKK.', 'KnnnK', 'KsnsK', 'KnnnK', '.KKK.'];

export function socketTexture(): Texture {
  return pixelTexture('power-socket', SOCKET, GEAR);
}

export function machineTexture(kind: MachineKind): Texture {
  return pixelTexture(`machine:${kind}`, MACHINE_ART[kind], GEAR);
}
