import { HERO } from '@stillwake/content';
import { cellsOf, grid } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { createClock } from '../../session/clock';
import type { Feature } from '../feature';
import { heroAt, STEP_MS, stepHero, UNIT, type Hero } from './hero';
import { createKeys } from './keys';

const BODY = 0xe8b04a;
const VISOR = 0x2b3a4a;

/**
 * This machine's hero: moved by the keyboard against the ship's cells, outside the sim, and
 * followed by the camera.
 */
export const crewFeature: Feature = {
  id: 'crew',
  layer() {
    const w = (HERO.width / UNIT) * CELL;
    const h = (HERO.height / UNIT) * CELL;
    const body = new Graphics()
      .rect(-w / 2, -h, w, h)
      .fill(BODY)
      .rect(w * 0.1, -h * 0.85, w * 0.4, h * 0.25)
      .fill(VISOR);
    const view = new Container();
    view.addChild(body);

    const keys = createKeys(window);
    const clock = createClock(STEP_MS);
    let hero: { previous: Hero; current: Hero } | undefined;

    return {
      view,
      update({ game, camera, screen, elapsedMs }) {
        const ship = game.client.sim.query(grid).layers();
        if (!hero) {
          const [spawn] = cellsOf(game.layout, 'S');
          if (spawn === undefined)
            throw new Error('The map has no S: nowhere for the hero to wake.');
          const woke = heroAt(ship, spawn);
          hero = { previous: woke, current: woke };
        }
        for (let due = clock.advance(elapsedMs); due > 0; due--) {
          hero = { previous: hero.current, current: stepHero(hero.current, keys.take(), ship) };
        }
        const { previous, current } = hero;

        // Drawn between the last two steps, so the hero moves smoothly at any refresh rate.
        const t = clock.progress();
        const x = previous.x + (current.x - previous.x) * t;
        const y = previous.y + (current.y - previous.y) * t;
        view.position.set((x / UNIT) * CELL, (y / UNIT) * CELL);
        body.scale.x = current.facing;
        camera.follow({ x: x / UNIT, y: (y - HERO.height / 2) / UNIT }, screen);
      },
      destroy() {
        keys.destroy();
      },
    };
  },
};
