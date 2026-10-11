import { HERO } from '@stillwake/content';
import { crew, grid } from '@stillwake/sim';
import { Container, Graphics, Text } from 'pixi.js';
import { t } from '../../i18n/en';
import { CELL } from '../../render/camera';
import { createClock } from '../../session/clock';
import type { Feature } from '../feature';
import { aimAt, usesOf, type Aim } from './aim';
import { heroAt, STEP_MS, stepHero, UNIT, type Hero } from './hero';
import { createKeys } from './keys';
import { reportOf } from './report';
import { SuitGauge } from './SuitGauge';

const BODY = 0xe8b04a;
const VISOR = 0x2b3a4a;
const AIM_READY = 0x7fe08a;
const AIM_REFUSED = 0xe05555;
// Neutral, so neither outline is lost against an orange door or a red valve.
const AIM_FAR = 0xc8d0dc;
const AIM_IDLE = 0xffffff;

/**
 * Outlines the cell under the pointer: green when E would work it, red when the sim would refuse
 * the work, grey when out of reach, faint when there is nothing to use.
 */
function drawAim(g: Graphics, width: number, aim: Aim | undefined) {
  g.clear();
  if (!aim) return;
  const x = (aim.cell % width) * CELL;
  const y = Math.floor(aim.cell / width) * CELL;
  if (!aim.press && !aim.work) {
    g.rect(x, y, CELL, CELL).stroke({ width: 1, color: AIM_IDLE, alpha: 0.35 });
    return;
  }
  const problem = aim.work ? aim.work.problem : aim.press?.problem;
  const colour = !aim.inReach ? AIM_FAR : problem ? AIM_REFUSED : AIM_READY;
  g.rect(x + 1, y + 1, CELL - 2, CELL - 2).stroke({ width: 2, color: colour });
}

/**
 * This machine's hero: moved by the keyboard against the ship's cells, outside the sim, and
 * followed by the camera. E under the pointer, within reach, toggles a door or valve or loads a tank
 * when pressed,
 * and works a plan while held: one `work` command for every tick the host releases.
 */
export const crewFeature: Feature = {
  id: 'crew',
  Panel: SuitGauge,
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
    const reason = new Text({
      text: '',
      style: {
        fontFamily: 'monospace',
        fontSize: 10,
        fill: 0xffe4e4,
        stroke: { color: 0x0b0f17, width: 3 },
      },
    });
    const view = new Container();
    view.addChild(aimView, figure, reason);

    const keys = createKeys(window);
    const clock = createClock(STEP_MS);
    let hero: { previous: Hero; current: Hero } | undefined;
    let workedOnTick = -1;
    let wasOut = false;

    return {
      view,
      update({ game, camera, screen, elapsedMs }) {
        const { sim } = game.client;
        const ship = sim.query(grid).layers();
        const spawn = sim.query(crew).spawn();
        const me = sim.query(crew).hero(game.client.id);
        const out = (me?.out ?? 0) > 0;
        // Waking from passing out, the sim has put the hero at the spawn: so does the client.
        if (!hero || (wasOut && !out)) {
          const woke = heroAt(ship, spawn);
          hero = { previous: woke, current: woke };
        }
        wasOut = out;
        for (let due = clock.advance(elapsedMs); due > 0; due--) {
          // Passed out, the hero takes no orders and only falls; keys pressed meanwhile are spent.
          const taken = keys.take();
          const input = out ? ({ x: 0, y: 0, jump: false } as const) : taken;
          hero = { previous: hero.current, current: stepHero(hero.current, input, ship) };
        }
        const { previous, current } = hero;

        const report = reportOf(sim, game.client.id, current);
        if (report) game.client.send(report);

        // Drawn between the last two steps, so the hero moves smoothly at any refresh rate.
        const between = clock.progress();
        const x = previous.x + (current.x - previous.x) * between;
        const y = previous.y + (current.y - previous.y) * between;
        figure.position.set((x / UNIT) * CELL, (y / UNIT) * CELL);
        body.scale.x = current.facing;
        camera.follow({ x: x / UNIT, y: (y - HERO.height / 2) / UNIT }, screen);

        // Aimed after following, so the pointer is read where the camera now is.
        const pointer = camera.pointer();
        const aim = pointer && aimAt(sim, current, pointer);
        drawAim(aimView, ship.width, aim);
        const problem = aim?.work ? aim.work.problem : aim?.press?.problem;
        reason.text = problem ? t(problem) : '';
        // A line below where the build tool writes its reason, so the two never overlap.
        if (pointer) reason.position.set(pointer.x * CELL + 12, pointer.y * CELL + 26);

        // The press is taken every frame, so one made out of reach is spent rather than kept.
        // Passed out, E does nothing: a press is spent, a hold works no plan.
        const pressed = keys.takeUse();
        const e = out ? { pressed: false, held: false } : { pressed, held: keys.holdsUse() };
        const uses = usesOf(aim, e, sim.world.tick, workedOnTick);
        workedOnTick = uses.workedOnTick;
        for (const c of uses.commands) game.client.send(c);
      },
      destroy() {
        keys.destroy();
      },
    };
  },
};
