import { grid } from '@stillwake/sim';
import { Container, Graphics, Sprite } from 'pixi.js';
import { CELL } from '../../render/camera';
import { predictedGrid } from '../../session/predicted';
import { lit } from '../../render/lighting';
import type { Feature } from '../feature';
import { CHUNK, chunkCount, chunksAcross, emptySeen, staleChunks, type Seen } from './chunks';
import { machineTexture } from './art';
import { drawBack, drawConduit, drawStructure, type Cells } from './draw';

/**
 * The ship drawn in pixel art (`./art`): back walls and the pipes in front of them behind everything,
 * then structure, then machines; redraws only chunks whose cells changed. Where pipes join machines
 * the pipes overlay shows.
 */
export const gridFeature: Feature = {
  id: 'grid',
  layer() {
    const view = new Container();
    const behind = new Container();
    const backLayer = new Container();
    const chunkLayer = new Container();
    const machineLayer = new Container();
    const conduitLayer = new Container();
    behind.addChild(backLayer, conduitLayer);
    view.addChild(chunkLayer, machineLayer);
    for (const layer of [backLayer, conduitLayer, machineLayer]) lit(layer);
    lit(chunkLayer, 'blocks');

    let backChunks: Graphics[] = [];
    let chunks: Graphics[] = [];
    let conduitChunks: Graphics[] = [];
    let seen: Seen | undefined;
    let size = { width: -1, height: -1 };
    let lastKey = '';
    let machinesKey = '';

    const redrawChunk = (cells: Cells, index: number) => {
      const backs = backChunks[index];
      const g = chunks[index];
      const pipes = conduitChunks[index];
      if (!backs || !g || !pipes) return;
      backs.clear();
      g.clear();
      pipes.clear();
      const across = chunksAcross(size.width);
      const cx = (index % across) * CHUNK;
      const cy = Math.floor(index / across) * CHUNK;
      for (let y = cy; y < Math.min(cy + CHUNK, size.height); y++) {
        for (let x = cx; x < Math.min(cx + CHUNK, size.width); x++) {
          drawBack(backs, cells, y * size.width + x);
          drawStructure(g, cells, y * size.width + x);
          drawConduit(pipes, cells, y * size.width + x);
        }
      }
    };

    return {
      view,
      behind,
      update({ game }) {
        const { sim } = game.client;
        // Cells change only on a tick or with this peer's own toggles, shown before their tick runs.
        const shown = predictedGrid(game.client);
        if (shown.key === lastKey) return;
        lastKey = shown.key;
        const q = sim.query(grid);
        const cells = { ...q.layers(), structure: shown.structure, conduit: shown.conduit };

        if (cells.width !== size.width || cells.height !== size.height) {
          size = { width: cells.width, height: cells.height };
          for (const g of [...backChunks, ...chunks, ...conduitChunks]) g.destroy();
          const count = chunkCount(size.width, size.height);
          backChunks = Array.from({ length: count }, () => new Graphics());
          chunks = Array.from({ length: count }, () => new Graphics());
          conduitChunks = Array.from({ length: count }, () => new Graphics());
          if (count > 0) {
            backLayer.addChild(...backChunks);
            chunkLayer.addChild(...chunks);
            conduitLayer.addChild(...conduitChunks);
          }
          seen = undefined;
        }
        if (!seen) {
          seen = emptySeen(cells);
          staleChunks(seen, cells);
          chunks.forEach((_, index) => redrawChunk(cells, index));
        } else {
          for (const index of staleChunks(seen, cells)) redrawChunk(cells, index);
        }

        const machines = q.machines();
        const key = machines.map((m) => `${m.id}:${m.kind}:${m.cell}`).join(',');
        if (key === machinesKey) return;
        machinesKey = key;
        for (const child of machineLayer.removeChildren()) child.destroy();
        for (const m of machines) {
          const at = { x: (m.cell % size.width) * CELL, y: Math.floor(m.cell / size.width) * CELL };
          const machine = new Sprite(machineTexture(m.kind));
          machine.position.set(at.x, at.y);
          machineLayer.addChild(machine);
        }
      },
    };
  },
};
