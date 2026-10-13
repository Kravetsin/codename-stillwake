import { MACHINES } from '@stillwake/content';
import { furnace, grid } from '@stillwake/sim';
import { Container } from 'pixi.js';
import { CELL } from '../../render/camera';
import { EFFECTS, particles } from '../../render/particles';
import type { Feature } from '../feature';

/** Embers a furnace at work gives off a second. */
const EMBERS_PER_SECOND = 7;

/**
 * A furnace at work without a word: embers rise from it while it smelts, none while it waits for
 * power, oxygen or room for what it yields. Its panel says why, on demand.
 */
export const furnaceFeature: Feature = {
  id: 'furnace',
  layer() {
    // Embers go to the effects layer; this one draws nothing of its own.
    const view = new Container();
    /** Embers owed to each furnace, by machine id, carried over between frames. */
    const owed = new Map<number, number>();
    return {
      view,
      update({ game, elapsedMs }) {
        const { sim } = game.client;
        const { width } = sim.query(grid).size();
        const { width: across, height: tall } = MACHINES.furnace;
        for (const m of sim.query(grid).machines()) {
          if (m.kind !== 'furnace') continue;
          const at = sim.query(furnace).at(m.id);
          if (!at || at.problem) {
            owed.delete(m.id);
            continue;
          }
          const due = (owed.get(m.id) ?? 0) + (EMBERS_PER_SECOND * elapsedMs) / 1000;
          const count = Math.floor(due);
          owed.set(m.id, due - count);
          // From the fire in its middle, a little to either side.
          const x = ((m.cell % width) + across / 2) * CELL;
          const y = (Math.floor(m.cell / width) + tall * 0.45) * CELL;
          for (let i = 0; i < count; i++) {
            particles.emit(EFFECTS.ember, { x: x + (Math.random() - 0.5) * CELL, y }, 1);
          }
        }
      },
    };
  },
};
