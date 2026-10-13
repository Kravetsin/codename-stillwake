import { MACHINES } from '@stillwake/content';
import { furnace, grid } from '@stillwake/sim';
import { Container, Sprite } from 'pixi.js';
import { CELL } from '../../render/camera';
import { EFFECTS, particles } from '../../render/particles';
import type { Feature } from '../feature';
import { FIRE, FIRE_AT, fireTexture } from './art';

/** Embers a furnace at work gives off a second. */
const EMBERS_PER_SECOND = 7;
/** How long the fire shows one picture before the next. */
const FLICKER_MS = 110;

/**
 * A furnace at work without a word: fire in its mouth and embers rising from it while it burns,
 * neither while it is out, for want of fuel, air or room. Its panel says why, on demand.
 */
export const furnaceFeature: Feature = {
  id: 'furnace',
  layer() {
    // Fire is drawn here, unlit, for it gives light; embers go to the effects layer.
    const view = new Container();
    /** Embers owed to each furnace, by machine id, carried over between frames. */
    const owed = new Map<number, number>();
    /** The fire in each furnace at work, by machine id. */
    const fires = new Map<number, { sprite: Sprite; frame: number }>();
    let flicker = 0;
    return {
      view,
      update({ game, elapsedMs }) {
        const { sim } = game.client;
        const { width } = sim.query(grid).size();
        const { width: across, height: tall } = MACHINES.furnace;
        flicker += elapsedMs;
        const turn = flicker >= FLICKER_MS;
        if (turn) flicker %= FLICKER_MS;
        const burning = new Set<number>();
        for (const m of sim.query(grid).machines()) {
          if (m.kind !== 'furnace') continue;
          const at = sim.query(furnace).at(m.id);
          if (!at.burning) {
            owed.delete(m.id);
            continue;
          }
          burning.add(m.id);
          let fire = fires.get(m.id);
          if (!fire) {
            fire = { sprite: new Sprite(fireTexture(m.id)), frame: m.id };
            fires.set(m.id, fire);
            view.addChild(fire.sprite);
          }
          if (turn) {
            // Never the same picture twice running, so the fire never stands still.
            fire.frame += 1 + Math.floor(Math.random() * (FIRE.length - 1));
            fire.sprite.texture = fireTexture(fire.frame);
          }
          fire.sprite.position.set(
            (m.cell % width) * CELL + FIRE_AT.x,
            Math.floor(m.cell / width) * CELL + FIRE_AT.y,
          );
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
        for (const [id, fire] of fires) {
          if (burning.has(id)) continue;
          fire.sprite.destroy();
          fires.delete(id);
        }
      },
    };
  },
};
