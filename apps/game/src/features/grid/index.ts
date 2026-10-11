import { MACHINES } from '@stillwake/content';
import { grid } from '@stillwake/sim';
import { Container, Graphics, Text } from 'pixi.js';
import { CELL } from '../../render/camera';
import type { Feature } from '../feature';
import { CHUNK, chunkCount, chunksAcross, emptySeen, staleChunks, type Seen } from './chunks';
import { Batch, drawConduit, drawGridLines, drawStructure, type Cells } from './draw';

const MACHINE_FILL = 0x2a3d4f;
const MACHINE_EDGE = 0x5f86a8;
const PORT = 0xd8e6f2;

/**
 * The ship drawn as flat graybox blocks, machines between structure and conduits so pipes show where
 * they join them; redraws only chunks whose cells changed.
 */
export const gridFeature: Feature = {
  id: 'grid',
  layer() {
    const view = new Container();
    const lines = new Graphics();
    const chunkLayer = new Container();
    const machineLayer = new Container();
    const conduitLayer = new Container();
    view.addChild(lines, chunkLayer, machineLayer, conduitLayer);

    let chunks: Graphics[] = [];
    let conduitChunks: Graphics[] = [];
    let seen: Seen | undefined;
    let size = { width: -1, height: -1 };
    let lastTick = -1;
    let machinesKey = '';

    const redrawChunk = (cells: Cells, index: number) => {
      const g = chunks[index];
      const pipes = conduitChunks[index];
      if (!g || !pipes) return;
      g.clear();
      pipes.clear();
      const batch = new Batch();
      const conduits = new Batch();
      const across = chunksAcross(size.width);
      const cx = (index % across) * CHUNK;
      const cy = Math.floor(index / across) * CHUNK;
      for (let y = cy; y < Math.min(cy + CHUNK, size.height); y++) {
        for (let x = cx; x < Math.min(cx + CHUNK, size.width); x++) {
          drawStructure(batch, cells, y * size.width + x);
          drawConduit(conduits, cells, y * size.width + x);
        }
      }
      batch.drawInto(g);
      conduits.drawInto(pipes);
    };

    return {
      view,
      update({ game }) {
        const { sim } = game.client;
        // Cells change only on a tick, so a frame between ticks has nothing new to draw.
        if (sim.world.tick === lastTick) return;
        lastTick = sim.world.tick;
        const q = sim.query(grid);
        const cells = q.layers();

        if (cells.width !== size.width || cells.height !== size.height) {
          size = { width: cells.width, height: cells.height };
          lines.clear();
          drawGridLines(lines, size.width, size.height);
          for (const g of [...chunks, ...conduitChunks]) g.destroy();
          const count = chunkCount(size.width, size.height);
          chunks = Array.from({ length: count }, () => new Graphics());
          conduitChunks = Array.from({ length: count }, () => new Graphics());
          if (count > 0) {
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
          const spec = MACHINES[m.kind];
          const box = new Graphics()
            .rect(2, 2, spec.width * CELL - 4, spec.height * CELL - 4)
            .fill(MACHINE_FILL)
            .stroke({ width: 2, color: MACHINE_EDGE });
          // A ring where a conduit joins: empty, it says where to lay one; a pipe drawn over fills it.
          for (const port of spec.ports) {
            box.rect(port.x * CELL + CELL / 2 - 4, port.y * CELL + CELL / 2 - 4, 8, 8);
          }
          box.stroke({ width: 2, color: PORT });
          const label = new Text({
            text: m.kind,
            style: { fontFamily: 'monospace', fontSize: 9, fill: 0xa8c4dc },
          });
          label.position.set(4, 3);
          // A one-cell machine is narrower than its name: the name shrinks to fit inside.
          label.scale.set(Math.min(1, (spec.width * CELL - 8) / label.width));
          const machine = new Container();
          machine.addChild(box, label);
          machine.position.set(
            (m.cell % size.width) * CELL,
            Math.floor(m.cell / size.width) * CELL,
          );
          machineLayer.addChild(machine);
        }
      },
    };
  },
};
