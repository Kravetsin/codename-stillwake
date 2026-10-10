import { HERO } from '@stillwake/content';
import { cellsOf, grid } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { createClock } from '../../session/clock';
import type { Feature } from '../feature';
import { aimAt, type Aim } from './aim';
import { heroAt, STEP_MS, stepHero, UNIT, type Hero } from './hero';
import { createKeys } from './keys';

const BODY = 0xe8b04a;
const VISOR = 0x2b3a4a;
const AIM_READY = 0x7fe08a;
// Neutral, so neither outline is lost against an orange door or a red valve.
const AIM_FAR = 0xc8d0dc;
const AIM_IDLE = 0xffffff;

/** Outlines the cell under the pointer: green when E would work it, grey when out of reach. */
function drawAim(g: Graphics, width: number, aim: Aim | undefined) {
  g.clear();
  if (!aim) return;
  const x = (aim.cell % width) * CELL;
  const y = Math.floor(aim.cell / width) * CELL;
  if (!aim.use) {
    g.rect(x, y, CELL, CELL).stroke({ width: 1, color: AIM_IDLE, alpha: 0.35 });
    return;
  }
  g.rect(x + 1, y + 1, CELL - 2, CELL - 2).stroke({
    width: 2,
    color: aim.inReach ? AIM_READY : AIM_FAR,
  });
}

/**
 * This machine's hero: moved by the keyboard against the ship's cells, outside the sim, and
 * followed by the camera. E works the door or valve under the pointer, through `grid`'s commands.
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
    const figure = new Container();
    figure.addChild(body);
    const aimView = new Graphics();
    const view = new Container();
    view.addChild(aimView, figure);

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
        figure.position.set((x / UNIT) * CELL, (y / UNIT) * CELL);
        body.scale.x = current.facing;
        camera.follow({ x: x / UNIT, y: (y - HERO.height / 2) / UNIT }, screen);

        // Aimed after following, so the pointer is read where the camera now is.
        const pointer = camera.pointer();
        const aim = pointer && aimAt(ship, current, pointer);
        drawAim(aimView, ship.width, aim);
        // Taken every frame, so a press out of reach is spent rather than kept for later.
        if (keys.takeUse() && aim?.use && aim.inReach) game.client.send(aim.use);
      },
      destroy() {
        keys.destroy();
      },
    };
  },
};
