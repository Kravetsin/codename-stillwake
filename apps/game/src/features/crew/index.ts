import { HERO } from '@stillwake/content';
import { crew } from '@stillwake/sim';
import { Container, Graphics, Text } from 'pixi.js';
import { t } from '../../i18n/en';
import { CELL } from '../../render/camera';
import { createClock } from '../../session/clock';
import type { Feature } from '../feature';
import { aimAt, usesOf, type Aim } from './aim';
import { heroAt, shipOf, STEP_MS, stepHero, UNIT, type Hero } from './hero';
import { createKeys } from './keys';
import { createHeroSender, createRemoteHeroes } from './remote';
import { reportOf } from './report';
import { SuitGauge } from './SuitGauge';

const BODY = 0xe8b04a;
/** Other players' heroes, so a player tells their own apart at a glance. */
const OTHER = 0x5fc8c0;
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

/** A hero's figure in `colour`, its feet at the origin; `body` flips to face the other way. */
function figureOf(colour: number): { figure: Container; body: Graphics } {
  const w = (HERO.width / UNIT) * CELL;
  const h = (HERO.height / UNIT) * CELL;
  const body = new Graphics()
    .rect(-w / 2, -h, w, h)
    .fill(colour)
    .rect(w * 0.1, -h * 0.85, w * 0.4, h * 0.25)
    .fill(VISOR);
  const figure = new Container();
  figure.addChild(body);
  return { figure, body };
}

/** Places `figure` at a hero's feet, in pixels, facing the way it faces. */
function place(shown: { figure: Container; body: Graphics }, x: number, y: number, facing: number) {
  shown.figure.position.set((x / UNIT) * CELL, (y / UNIT) * CELL);
  shown.body.scale.x = facing;
}

/**
 * Other players' heroes, as their peers send them through the host, drawn a little behind so they
 * move smoothly between sends; and this machine's hero: moved by the keyboard against the ship's cells, outside the sim, and
 * followed by the camera. E under the pointer, within reach, toggles a door or valve or loads a tank
 * when pressed,
 * and works a plan while held: one `work` command for every tick the host releases.
 */
export const crewFeature: Feature = {
  id: 'crew',
  Panel: SuitGauge,
  layer() {
    const own = figureOf(BODY);
    const others = new Container();
    const shownOthers = new Map<number, { figure: Container; body: Graphics }>();
    const remote = createRemoteHeroes();
    let clockMs = 0;
    let sendTo: { sendHero(state: unknown): void } | undefined;
    const sender = createHeroSender((hero) => sendTo?.sendHero(hero));
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
    view.addChild(aimView, others, own.figure, reason);

    const keys = createKeys(window);
    const clock = createClock(STEP_MS);
    let hero: { previous: Hero; current: Hero } | undefined;
    let workedOnTick = -1;
    let wasOut = false;

    return {
      view,
      update({ game, camera, screen, elapsedMs }) {
        const { sim } = game.client;
        const ship = shipOf(sim);
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

        // Others' heroes in, this one out: through the host, never through the simulation.
        clockMs += elapsedMs;
        sendTo = game.client;
        sender.step(elapsedMs, current);
        for (const { from, state } of game.client.takeHeroes())
          remote.add(from, state as Hero, clockMs);
        const heard = remote.at(clockMs);
        for (const [id, shown] of shownOthers)
          shown.figure.visible = heard.some((h) => h.id === id);
        for (const { id, hero: other } of heard) {
          let shown = shownOthers.get(id);
          if (!shown) {
            shown = figureOf(OTHER);
            shownOthers.set(id, shown);
            others.addChild(shown.figure);
          }
          shown.figure.visible = true;
          place(shown, other.x, other.y, other.facing);
        }

        // Drawn between the last two steps, so the hero moves smoothly at any refresh rate.
        const between = clock.progress();
        const x = previous.x + (current.x - previous.x) * between;
        const y = previous.y + (current.y - previous.y) * between;
        place(own, x, y, current.facing);
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
